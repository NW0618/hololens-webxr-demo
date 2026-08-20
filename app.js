const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;
let gl = null;
let xrRefSpace = null;
let program = null;

let cubePositionBuffer = null;
let cubeIndexBuffer = null;
let rayBuffer = null;


// ==================================================
// オブジェクト
// ==================================================

const BOX_HALF = 0.15;

let boxes = [
    {
        center: [0, 0, -1.5],
        color: [0.2, 0.6, 1.0, 1.0]
    }
];


// ==================================================
// 「＋」ボタン
// ==================================================

const ADD_CENTER = [-0.55, 0.40, -1.2];
const ADD_HALF = 0.16;

const ADD_COLOR = [
    0.2,
    1.0,
    0.3,
    1.0
];


// ==================================================
// 選択状態
// ==================================================

let hoverTarget = null;

let isDragging = false;
let activeInputSource = null;
let activeBoxIndex = null;
let dragDistance = 1.5;


// ==================================================
// シェーダー
// ==================================================

const vertexShaderSource = `
attribute vec3 aPosition;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;

void main() {
    gl_Position =
        uProjectionMatrix *
        uViewMatrix *
        uModelMatrix *
        vec4(aPosition, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform vec4 uColor;

void main() {
    gl_FragColor = uColor;
}
`;


// ==================================================
// WebGL
// ==================================================

function createShader(type, source) {

    const shader =
        gl.createShader(type);

    gl.shaderSource(
        shader,
        source
    );

    gl.compileShader(shader);

    if (
        !gl.getShaderParameter(
            shader,
            gl.COMPILE_STATUS
        )
    ) {
        throw new Error(
            gl.getShaderInfoLog(shader)
        );
    }

    return shader;
}


function createProgram() {

    const vertexShader =
        createShader(
            gl.VERTEX_SHADER,
            vertexShaderSource
        );

    const fragmentShader =
        createShader(
            gl.FRAGMENT_SHADER,
            fragmentShaderSource
        );

    const shaderProgram =
        gl.createProgram();

    gl.attachShader(
        shaderProgram,
        vertexShader
    );

    gl.attachShader(
        shaderProgram,
        fragmentShader
    );

    gl.linkProgram(shaderProgram);

    if (
        !gl.getProgramParameter(
            shaderProgram,
            gl.LINK_STATUS
        )
    ) {
        throw new Error(
            gl.getProgramInfoLog(
                shaderProgram
            )
        );
    }

    return shaderProgram;
}


// ==================================================
// 立方体データ
// 単位立方体を作り、行列で大きさを変更
// ==================================================

function createGeometry() {

    const cubeVertices =
        new Float32Array([

            -1, -1, -1,
             1, -1, -1,
             1,  1, -1,
            -1,  1, -1,

            -1, -1,  1,
             1, -1,  1,
             1,  1,  1,
            -1,  1,  1

        ]);


    const cubeIndices =
        new Uint16Array([

            0, 1, 2,
            0, 2, 3,

            4, 6, 5,
            4, 7, 6,

            0, 4, 5,
            0, 5, 1,

            3, 2, 6,
            3, 6, 7,

            1, 5, 6,
            1, 6, 2,

            0, 3, 7,
            0, 7, 4

        ]);


    cubePositionBuffer =
        gl.createBuffer();

    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        cubePositionBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        cubeVertices,
        gl.STATIC_DRAW
    );


    cubeIndexBuffer =
        gl.createBuffer();

    gl.bindBuffer(
        gl.ELEMENT_ARRAY_BUFFER,
        cubeIndexBuffer
    );

    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        cubeIndices,
        gl.STATIC_DRAW
    );


    rayBuffer =
        gl.createBuffer();
}


// ==================================================
// 行列
// ==================================================

function identityMatrix() {

    return new Float32Array([

        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1

    ]);
}


function modelMatrix(
    center,
    scaleX,
    scaleY,
    scaleZ
) {

    return new Float32Array([

        scaleX, 0, 0, 0,
        0, scaleY, 0, 0,
        0, 0, scaleZ, 0,

        center[0],
        center[1],
        center[2],
        1

    ]);
}


// ==================================================
// ベクトル
// ==================================================

function transformDirection(
    matrix,
    x,
    y,
    z
) {

    return [

        matrix[0] * x +
        matrix[4] * y +
        matrix[8] * z,

        matrix[1] * x +
        matrix[5] * y +
        matrix[9] * z,

        matrix[2] * x +
        matrix[6] * y +
        matrix[10] * z

    ];
}


function normalize(vector) {

    const length =
        Math.hypot(
            vector[0],
            vector[1],
            vector[2]
        );

    if (length === 0) {

        return [
            0,
            0,
            -1
        ];
    }

    return [

        vector[0] / length,
        vector[1] / length,
        vector[2] / length

    ];
}


function dot(a, b) {

    return (
        a[0] * b[0] +
        a[1] * b[1] +
        a[2] * b[2]
    );
}


// ==================================================
// レイと箱の当たり判定
// ==================================================

function rayBoxDistance(
    origin,
    direction,
    center,
    half
) {

    const min = [

        center[0] - half,
        center[1] - half,
        center[2] - half

    ];


    const max = [

        center[0] + half,
        center[1] + half,
        center[2] + half

    ];


    let tmin = -Infinity;
    let tmax = Infinity;


    for (let i = 0; i < 3; i++) {

        if (
            Math.abs(direction[i]) <
            0.000001
        ) {

            if (
                origin[i] < min[i] ||
                origin[i] > max[i]
            ) {
                return null;
            }

        } else {

            const t1 =
                (min[i] - origin[i]) /
                direction[i];

            const t2 =
                (max[i] - origin[i]) /
                direction[i];


            const near =
                Math.min(t1, t2);

            const far =
                Math.max(t1, t2);


            tmin =
                Math.max(
                    tmin,
                    near
                );

            tmax =
                Math.min(
                    tmax,
                    far
                );


            if (tmin > tmax) {

                return null;
            }
        }
    }


    if (tmax < 0) {

        return null;
    }


    return (
        tmin >= 0
            ? tmin
            : tmax
    );
}


// ==================================================
// 一番手前の対象を探す
// ==================================================

function findNearestTarget(
    origin,
    direction
) {

    let result = null;


    // ----------------------------
    // 追加ボタン
    // ----------------------------

    const addDistance =
        rayBoxDistance(
            origin,
            direction,
            ADD_CENTER,
            ADD_HALF
        );


    if (addDistance !== null) {

        result = {

            type: "add",
            distance: addDistance

        };
    }


    // ----------------------------
    // 通常の箱
    // ----------------------------

    for (
        let i = 0;
        i < boxes.length;
        i++
    ) {

        const distance =
            rayBoxDistance(
                origin,
                direction,
                boxes[i].center,
                BOX_HALF
            );


        if (distance === null) {

            continue;
        }


        if (
            result === null ||
            distance < result.distance
        ) {

            result = {

                type: "box",
                index: i,
                distance: distance

            };
        }
    }


    return result;
}


// ==================================================
// XR入力レイ
// ==================================================

function getRay(
    frame,
    inputSource
) {

    const pose =
        frame.getPose(
            inputSource.targetRaySpace,
            xrRefSpace
        );


    if (!pose) {

        return null;
    }


    const matrix =
        pose.transform.matrix;


    const origin = [

        matrix[12],
        matrix[13],
        matrix[14]

    ];


    const direction =
        normalize(

            transformDirection(
                matrix,
                0,
                0,
                -1
            )

        );


    return {

        origin,
        direction

    };
}


// ==================================================
// 立方体描画
// ==================================================

function drawCube(
    view,
    center,
    scaleX,
    scaleY,
    scaleZ,
    color
) {

    gl.useProgram(program);


    const positionLocation =
        gl.getAttribLocation(
            program,
            "aPosition"
        );


    const projectionLocation =
        gl.getUniformLocation(
            program,
            "uProjectionMatrix"
        );


    const viewLocation =
        gl.getUniformLocation(
            program,
            "uViewMatrix"
        );


    const modelLocation =
        gl.getUniformLocation(
            program,
            "uModelMatrix"
        );


    const colorLocation =
        gl.getUniformLocation(
            program,
            "uColor"
        );


    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        cubePositionBuffer
    );


    gl.enableVertexAttribArray(
        positionLocation
    );


    gl.vertexAttribPointer(
        positionLocation,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );


    gl.bindBuffer(
        gl.ELEMENT_ARRAY_BUFFER,
        cubeIndexBuffer
    );


    gl.uniformMatrix4fv(
        projectionLocation,
        false,
        view.projectionMatrix
    );


    gl.uniformMatrix4fv(
        viewLocation,
        false,
        view.transform.inverse.matrix
    );


    gl.uniformMatrix4fv(
        modelLocation,
        false,
        modelMatrix(
            center,
            scaleX,
            scaleY,
            scaleZ
        )
    );


    gl.uniform4fv(
        colorLocation,
        color
    );


    gl.drawElements(
        gl.TRIANGLES,
        36,
        gl.UNSIGNED_SHORT,
        0
    );
}


// ==================================================
// 通常オブジェクト描画
// ==================================================

function drawBoxes(view) {

    for (
        let i = 0;
        i < boxes.length;
        i++
    ) {

        let color =
            boxes[i].color;


        if (
            isDragging &&
            activeBoxIndex === i
        ) {

            color = [

                0.2,
                1.0,
                0.3,
                1.0

            ];

        } else if (
            hoverTarget &&
            hoverTarget.type === "box" &&
            hoverTarget.index === i
        ) {

            color = [

                1.0,
                1.0,
                0.2,
                1.0

            ];
        }


        drawCube(
            view,
            boxes[i].center,

            BOX_HALF,
            BOX_HALF,
            BOX_HALF,

            color
        );
    }
}


// ==================================================
// 「＋」描画
// ==================================================

function drawAddButton(view) {

    let color =
        ADD_COLOR;


    if (
        hoverTarget &&
        hoverTarget.type === "add"
    ) {

        color = [

            1.0,
            1.0,
            0.2,
            1.0

        ];
    }


    // 横棒
    drawCube(
        view,
        ADD_CENTER,

        0.14,
        0.04,
        0.035,

        color
    );


    // 縦棒
    drawCube(
        view,
        ADD_CENTER,

        0.04,
        0.14,
        0.035,

        color
    );
}


// ==================================================
// レイ描画
// ==================================================

function drawRay(
    view,
    origin,
    direction
) {

    const rayLength =
        2.5;


    const end = [

        origin[0] +
        direction[0] *
        rayLength,

        origin[1] +
        direction[1] *
        rayLength,

        origin[2] +
        direction[2] *
        rayLength

    ];


    const vertices =
        new Float32Array([

            origin[0],
            origin[1],
            origin[2],

            end[0],
            end[1],
            end[2]

        ]);


    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        rayBuffer
    );


    gl.bufferData(
        gl.ARRAY_BUFFER,
        vertices,
        gl.DYNAMIC_DRAW
    );


    gl.useProgram(program);


    const positionLocation =
        gl.getAttribLocation(
            program,
            "aPosition"
        );


    const projectionLocation =
        gl.getUniformLocation(
            program,
            "uProjectionMatrix"
        );


    const viewLocation =
        gl.getUniformLocation(
            program,
            "uViewMatrix"
        );


    const modelLocation =
        gl.getUniformLocation(
            program,
            "uModelMatrix"
        );


    const colorLocation =
        gl.getUniformLocation(
            program,
            "uColor"
        );


    gl.enableVertexAttribArray(
        positionLocation
    );


    gl.vertexAttribPointer(
        positionLocation,
        3,
        gl.FLOAT,
        false,
        0,
        0
    );


    gl.uniformMatrix4fv(
        projectionLocation,
        false,
        view.projectionMatrix
    );


    gl.uniformMatrix4fv(
        viewLocation,
        false,
        view.transform.inverse.matrix
    );


    gl.uniformMatrix4fv(
        modelLocation,
        false,
        identityMatrix()
    );


    let rayColor = [

        1,
        1,
        1,
        1

    ];


    if (isDragging) {

        rayColor = [

            0.2,
            1.0,
            0.3,
            1.0

        ];

    } else if (hoverTarget) {

        rayColor = [

            1.0,
            1.0,
            0.2,
            1.0

        ];
    }


    gl.uniform4fv(
        colorLocation,
        rayColor
    );


    gl.drawArrays(
        gl.LINES,
        0,
        2
    );
}


// ==================================================
// 新しい箱を追加
// ==================================================

function addNewBox() {

    const slots = [

        [0.45, 0.00, -1.5],
        [-0.45, 0.00, -1.5],

        [0.00, 0.40, -1.5],
        [0.00, -0.40, -1.5],

        [0.45, 0.40, -1.5],
        [-0.45, 0.40, -1.5],

        [0.45, -0.40, -1.5],
        [-0.45, -0.40, -1.5]

    ];


    const index =
        (boxes.length - 1) %
        slots.length;


    const layer =
        Math.floor(
            (boxes.length - 1) /
            slots.length
        );


    const base =
        slots[index];


    boxes.push({

        center: [

            base[0],
            base[1],
            base[2] -
            layer * 0.4

        ],

        color: [

            0.2,
            0.6,
            1.0,
            1.0

        ]

    });
}


// ==================================================
// XRフレーム
// ==================================================

function onXRFrame(
    time,
    frame
) {

    const session =
        frame.session;


    session.requestAnimationFrame(
        onXRFrame
    );


    const viewerPose =
        frame.getViewerPose(
            xrRefSpace
        );


    if (!viewerPose) {

        return;
    }


    let currentRay =
        null;


    // ==================================================
    // 掴んでいる場合
    // ==================================================

    if (
        isDragging &&
        activeInputSource &&
        activeBoxIndex !== null
    ) {

        const dragRay =
            getRay(
                frame,
                activeInputSource
            );


        if (dragRay) {

            boxes[
                activeBoxIndex
            ].center = [

                dragRay.origin[0] +
                dragRay.direction[0] *
                dragDistance,

                dragRay.origin[1] +
                dragRay.direction[1] *
                dragDistance,

                dragRay.origin[2] +
                dragRay.direction[2] *
                dragDistance

            ];


            currentRay =
                dragRay;
        }


        hoverTarget = {

            type: "box",
            index: activeBoxIndex

        };

    } else {

        // ==================================================
        // 通常状態
        // ==================================================

        for (
            const inputSource
            of session.inputSources
        ) {

            const ray =
                getRay(
                    frame,
                    inputSource
                );


            if (ray) {

                currentRay =
                    ray;

                break;
            }
        }


        hoverTarget =
            null;


        if (currentRay) {

            hoverTarget =
                findNearestTarget(
                    currentRay.origin,
                    currentRay.direction
                );
        }
    }


    // ==================================================
    // 描画
    // ==================================================

    gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        session.renderState
            .baseLayer
            .framebuffer
    );


    gl.clearColor(
        0,
        0,
        0,
        0
    );


    gl.clear(
        gl.COLOR_BUFFER_BIT |
        gl.DEPTH_BUFFER_BIT
    );


    for (
        const view
        of viewerPose.views
    ) {

        const viewport =
            session.renderState
                .baseLayer
                .getViewport(view);


        gl.viewport(
            viewport.x,
            viewport.y,
            viewport.width,
            viewport.height
        );


        drawBoxes(view);

        drawAddButton(view);


        if (currentRay) {

            drawRay(
                view,
                currentRay.origin,
                currentRay.direction
            );
        }
    }
}


// ==================================================
// WebXR確認
// ==================================================

async function checkXR() {

    if (!window.isSecureContext) {

        status.textContent =
            "WebXRにはHTTPSが必要です。";

        return;
    }


    if (!navigator.xr) {

        xrButton.textContent =
            "WebXR非対応";


        status.textContent =
            "このブラウザではWebXRを利用できません。";

        return;
    }


    try {

        const supported =
            await navigator.xr
                .isSessionSupported(
                    "immersive-ar"
                );


        if (supported) {

            xrButton.disabled =
                false;


            xrButton.textContent =
                "MR体験を開始";


            status.textContent =
                "Immersive AR対応";

        } else {

            xrButton.textContent =
                "AR非対応";


            status.textContent =
                "immersive-arを利用できません。";
        }

    } catch (error) {

        status.textContent =
            "WebXR確認エラー: " +
            error.message;
    }
}


// ==================================================
// MR開始
// ==================================================

xrButton.addEventListener(
    "click",
    async () => {

        if (xrSession) {

            await xrSession.end();

            return;
        }


        try {

            xrSession =
                await navigator.xr
                    .requestSession(
                        "immersive-ar"
                    );


            const canvas =
                document.createElement(
                    "canvas"
                );


            gl =
                canvas.getContext(
                    "webgl",
                    {
                        xrCompatible: true,
                        alpha: true
                    }
                );


            await gl.makeXRCompatible();


            xrSession.updateRenderState({

                baseLayer:
                    new XRWebGLLayer(
                        xrSession,
                        gl
                    )

            });


            xrRefSpace =
                await xrSession
                    .requestReferenceSpace(
                        "local"
                    );


            program =
                createProgram();


            createGeometry();


            gl.enable(
                gl.DEPTH_TEST
            );


            // ==================================================
            // 選択開始
            // ==================================================

            xrSession.addEventListener(
                "selectstart",
                (event) => {

                    const ray =
                        getRay(
                            event.frame,
                            event.inputSource
                        );


                    if (!ray) {

                        return;
                    }


                    const target =
                        findNearestTarget(
                            ray.origin,
                            ray.direction
                        );


                    if (!target) {

                        return;
                    }


                    // ==================================================
                    // ＋ボタン
                    // ==================================================

                    if (
                        target.type ===
                        "add"
                    ) {

                        addNewBox();

                        return;
                    }


                    // ==================================================
                    // 通常の箱
                    // ==================================================

                    if (
                        target.type ===
                        "box"
                    ) {

                        activeBoxIndex =
                            target.index;


                        isDragging =
                            true;


                        activeInputSource =
                            event.inputSource;


                        const boxCenter =
                            boxes[
                                activeBoxIndex
                            ].center;


                        const toCenter = [

                            boxCenter[0] -
                            ray.origin[0],

                            boxCenter[1] -
                            ray.origin[1],

                            boxCenter[2] -
                            ray.origin[2]

                        ];


                        dragDistance =
                            dot(
                                toCenter,
                                ray.direction
                            );


                        dragDistance =
                            Math.max(
                                0.3,
                                Math.min(
                                    dragDistance,
                                    3.0
                                )
                            );
                    }
                }
            );


            // ==================================================
            // 選択終了
            // ==================================================

            xrSession.addEventListener(
                "selectend",
                (event) => {

                    if (
                        event.inputSource !==
                        activeInputSource
                    ) {

                        return;
                    }


                    isDragging =
                        false;


                    activeInputSource =
                        null;


                    activeBoxIndex =
                        null;
                }
            );


            // ==================================================
            // MR終了
            // ==================================================

            xrSession.addEventListener(
                "end",
                () => {

                    xrSession =
                        null;


                    isDragging =
                        false;


                    activeInputSource =
                        null;


                    activeBoxIndex =
                        null;


                    xrButton.textContent =
                        "MR体験を開始";
                }
            );


            xrButton.textContent =
                "MR体験を終了";


            xrSession
                .requestAnimationFrame(
                    onXRFrame
                );


        } catch (error) {

            status.textContent =
                "MR開始エラー: " +
                error.message;
        }
    }
);


// ==================================================
// 初期化
// ==================================================

checkXR();