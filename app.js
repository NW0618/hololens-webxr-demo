const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;
let gl = null;
let xrRefSpace = null;
let program = null;

let cubePositionBuffer = null;
let cubeIndexBuffer = null;
let rayBuffer = null;

// 箱の状態
let BOX_CENTER = [0, 0, -1.5];
const BOX_HALF = 0.15;

let boxColor = [0.2, 0.6, 1.0, 1.0];
let rayHitBox = false;

// ドラッグ状態
let isDragging = false;
let activeInputSource = null;
let dragDistance = 1.5;


// ========================================
// シェーダー
// ========================================

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


// ========================================
// WebGL初期化
// ========================================

function createShader(type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
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


// ========================================
// 3D形状
// ========================================

function createGeometry() {

    const cubeVertices =
        new Float32Array([

            -0.15, -0.15, -0.15,
             0.15, -0.15, -0.15,
             0.15,  0.15, -0.15,
            -0.15,  0.15, -0.15,

            -0.15, -0.15,  0.15,
             0.15, -0.15,  0.15,
             0.15,  0.15,  0.15,
            -0.15,  0.15,  0.15
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


// ========================================
// 行列
// ========================================

function identityMatrix() {

    return new Float32Array([

        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1

    ]);
}


function translationMatrix(x, y, z) {

    const matrix =
        identityMatrix();

    matrix[12] = x;
    matrix[13] = y;
    matrix[14] = z;

    return matrix;
}


// ========================================
// ベクトル計算
// ========================================

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


// ========================================
// レイと箱の当たり判定
// ========================================

function rayBoxDistance(
    origin,
    direction
) {

    const min = [

        BOX_CENTER[0] - BOX_HALF,
        BOX_CENTER[1] - BOX_HALF,
        BOX_CENTER[2] - BOX_HALF

    ];


    const max = [

        BOX_CENTER[0] + BOX_HALF,
        BOX_CENTER[1] + BOX_HALF,
        BOX_CENTER[2] + BOX_HALF

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


// ========================================
// XR入力レイ取得
// ========================================

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


// ========================================
// 箱描画
// ========================================

function drawCube(view) {

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
        translationMatrix(
            BOX_CENTER[0],
            BOX_CENTER[1],
            BOX_CENTER[2]
        )
    );


    let displayColor =
        boxColor;


    if (
        rayHitBox &&
        !isDragging
    ) {

        displayColor =
            [
                1.0,
                1.0,
                0.2,
                1.0
            ];
    }


    gl.uniform4fv(
        colorLocation,
        displayColor
    );


    gl.drawElements(
        gl.TRIANGLES,
        36,
        gl.UNSIGNED_SHORT,
        0
    );
}


// ========================================
// レイ描画
// ========================================

function drawRay(
    view,
    origin,
    direction
) {

    const rayLength = 2.5;


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

        1.0,
        1.0,
        1.0,
        1.0

    ];


    if (isDragging) {

        rayColor = [

            0.2,
            1.0,
            0.3,
            1.0

        ];

    } else if (rayHitBox) {

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


// ========================================
// XRフレーム処理
// ========================================

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


    let currentRay = null;


    // ----------------------------
    // ドラッグ中
    // ----------------------------

    if (
        isDragging &&
        activeInputSource
    ) {

        const dragRay =
            getRay(
                frame,
                activeInputSource
            );


        if (dragRay) {

            BOX_CENTER = [

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


            rayHitBox =
                true;
        }

    } else {

        // ----------------------------
        // 通常状態
        // ----------------------------

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


        rayHitBox =
            false;


        if (currentRay) {

            const distance =
                rayBoxDistance(
                    currentRay.origin,
                    currentRay.direction
                );


            rayHitBox =
                distance !== null;
        }
    }


    // ----------------------------
    // 描画
    // ----------------------------

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


        drawCube(view);


        if (currentRay) {

            drawRay(
                view,
                currentRay.origin,
                currentRay.direction
            );
        }
    }
}


// ========================================
// WebXR対応確認
// ========================================

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


// ========================================
// MR開始
// ========================================

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


            // ========================================
            // 掴み開始
            // ========================================

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


                    const distance =
                        rayBoxDistance(
                            ray.origin,
                            ray.direction
                        );


                    // 箱に当たっていなければ
                    // 掴まない
                    if (
                        distance === null
                    ) {

                        return;
                    }


                    isDragging =
                        true;


                    activeInputSource =
                        event.inputSource;


                    dragDistance =
                        Math.max(
                            0.3,
                            Math.min(
                                distance,
                                3.0
                            )
                        );


                    // 掴んでいる間は緑
                    boxColor = [

                        0.2,
                        1.0,
                        0.3,
                        1.0

                    ];
                }
            );


            // ========================================
            // 掴み終了
            // ========================================

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


                    // 離したら青
                    boxColor = [

                        0.2,
                        0.6,
                        1.0,
                        1.0

                    ];
                }
            );


            // ========================================
            // MR終了
            // ========================================

            xrSession.addEventListener(
                "end",
                () => {

                    xrSession =
                        null;


                    isDragging =
                        false;


                    activeInputSource =
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


// ========================================
// 初期化
// ========================================

checkXR();