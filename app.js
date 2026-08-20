const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;
let gl = null;
let xrRefSpace = null;
let program = null;

let cubePositionBuffer = null;
let cubeIndexBuffer = null;
let rayBuffer = null;

const BOX_HALF = 0.15;

// ==================================================
// 色
// ==================================================

const COLORS = {
    red:    [1.0, 0.2, 0.2, 1.0],
    blue:   [0.2, 0.6, 1.0, 1.0],
    green:  [0.2, 1.0, 0.3, 1.0],
    yellow: [1.0, 1.0, 0.2, 1.0],
    purple: [0.8, 0.4, 1.0, 1.0],
    white:  [1.0, 1.0, 1.0, 1.0]
};

// ==================================================
// 3個のオブジェクト
// ==================================================

let boxes = [
    {
        center: [-0.45, 0, -1.5],
        colorName: "red",
        color: COLORS.red,
        scale: 1.0,
        rotationY: 0
    },
    {
        center: [0, 0, -1.5],
        colorName: "blue",
        color: COLORS.blue,
        scale: 1.0,
        rotationY: 0
    },
    {
        center: [0.45, 0, -1.5],
        colorName: "green",
        color: COLORS.green,
        scale: 1.0,
        rotationY: 0
    }
];

let selectedBoxIndex = 0;

// ==================================================
// ゴール
// ==================================================

const GOAL_CENTER = [0, -0.45, -1.5];
const GOAL_HALF = 0.28;

let gameCleared = false;

// ==================================================
// 操作ボタン
// ==================================================

const ADD_CENTER = [-0.55, 0.45, -1.2];
const PLUS_CENTER = [0.00, 0.45, -1.2];
const MINUS_CENTER = [0.55, 0.45, -1.2];

const BUTTON_HALF = 0.16;

// ==================================================
// 操作状態
// ==================================================

let hoverTarget = null;

let isDragging = false;
let activeInputSource = null;
let activeBoxIndex = null;
let dragDistance = 1.5;

let pressStartTime = 0;
let pressStartCenter = null;

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

// ==================================================
// 形状
// ==================================================

function createGeometry() {
    const vertices =
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

    const indices =
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
        vertices,
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
        indices,
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
    scale,
    rotationY
) {
    const c =
        Math.cos(rotationY);

    const s =
        Math.sin(rotationY);

    const size =
        BOX_HALF * scale;

    return new Float32Array([
         c * size, 0, -s * size, 0,
         0,        size, 0,        0,
         s * size, 0,  c * size,  0,

         center[0],
         center[1],
         center[2],
         1
    ]);
}

function simpleMatrix(
    center,
    sx,
    sy,
    sz
) {
    return new Float32Array([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, sz, 0,

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

function normalize(v) {
    const length =
        Math.hypot(
            v[0],
            v[1],
            v[2]
        );

    if (length === 0) {
        return [0, 0, -1];
    }

    return [
        v[0] / length,
        v[1] / length,
        v[2] / length
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
// 当たり判定
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
                Math.max(tmin, near);

            tmax =
                Math.min(tmax, far);

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
// 一番近い対象
// ==================================================

function findNearestTarget(
    origin,
    direction
) {
    let result = null;

    const buttons = [
        {
            type: "add",
            center: ADD_CENTER
        },
        {
            type: "scaleUp",
            center: PLUS_CENTER
        },
        {
            type: "scaleDown",
            center: MINUS_CENTER
        }
    ];

    for (
        const button
        of buttons
    ) {
        const distance =
            rayBoxDistance(
                origin,
                direction,
                button.center,
                BUTTON_HALF
            );

        if (
            distance !== null &&
            (
                result === null ||
                distance <
                result.distance
            )
        ) {
            result = {
                type: button.type,
                distance: distance
            };
        }
    }

    for (
        let i = 0;
        i < boxes.length;
        i++
    ) {
        const half =
            BOX_HALF *
            boxes[i].scale;

        const distance =
            rayBoxDistance(
                origin,
                direction,
                boxes[i].center,
                half
            );

        if (
            distance !== null &&
            (
                result === null ||
                distance <
                result.distance
            )
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
// XRレイ
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
// 共通描画
// ==================================================

function drawShape(
    view,
    matrix,
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
        matrix
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
// オブジェクト描画
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
            color =
                COLORS.green;
        } else if (
            hoverTarget &&
            hoverTarget.type === "box" &&
            hoverTarget.index === i
        ) {
            color =
                COLORS.yellow;
        } else if (
            selectedBoxIndex === i
        ) {
            color =
                COLORS.purple;
        }

        drawShape(
            view,

            modelMatrix(
                boxes[i].center,
                boxes[i].scale,
                boxes[i].rotationY
            ),

            color
        );
    }
}

// ==================================================
// ゴール描画
// ==================================================

function drawGoal(view) {
    const color =
        gameCleared
            ? COLORS.green
            : COLORS.red;

    const x =
        GOAL_CENTER[0];

    const y =
        GOAL_CENTER[1];

    const z =
        GOAL_CENTER[2];

    const h =
        GOAL_HALF;

    const thickness =
        0.025;

    // 上
    drawShape(
        view,
        simpleMatrix(
            [x, y + h, z],
            h,
            thickness,
            thickness
        ),
        color
    );

    // 下
    drawShape(
        view,
        simpleMatrix(
            [x, y - h, z],
            h,
            thickness,
            thickness
        ),
        color
    );

    // 左
    drawShape(
        view,
        simpleMatrix(
            [x - h, y, z],
            thickness,
            h,
            thickness
        ),
        color
    );

    // 右
    drawShape(
        view,
        simpleMatrix(
            [x + h, y, z],
            thickness,
            h,
            thickness
        ),
        color
    );
}

// ==================================================
// ボタン
// ==================================================

function buttonColor(type) {
    if (
        hoverTarget &&
        hoverTarget.type === type
    ) {
        return COLORS.yellow;
    }

    return COLORS.green;
}

function drawButtons(view) {
    const addColor =
        buttonColor("add");

    const scaleUpColor =
        buttonColor("scaleUp");

    const scaleDownColor =
        buttonColor("scaleDown");

    // 個数追加
    drawShape(
        view,
        simpleMatrix(
            [
                ADD_CENTER[0] - 0.055,
                ADD_CENTER[1] - 0.035,
                ADD_CENTER[2]
            ],
            0.075,
            0.075,
            0.055
        ),
        addColor
    );

    drawShape(
        view,
        simpleMatrix(
            [
                ADD_CENTER[0] + 0.055,
                ADD_CENTER[1] + 0.035,
                ADD_CENTER[2] - 0.025
            ],
            0.075,
            0.075,
            0.055
        ),
        addColor
    );

    // 拡大 +
    drawShape(
        view,
        simpleMatrix(
            PLUS_CENTER,
            0.14,
            0.04,
            0.035
        ),
        scaleUpColor
    );

    drawShape(
        view,
        simpleMatrix(
            PLUS_CENTER,
            0.04,
            0.14,
            0.035
        ),
        scaleUpColor
    );

    // 縮小 -
    drawShape(
        view,
        simpleMatrix(
            MINUS_CENTER,
            0.14,
            0.04,
            0.035
        ),
        scaleDownColor
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

    let color =
        COLORS.white;

    if (isDragging) {
        color =
            COLORS.green;
    } else if (hoverTarget) {
        color =
            COLORS.yellow;
    }

    gl.uniform4fv(
        colorLocation,
        color
    );

    gl.drawArrays(
        gl.LINES,
        0,
        2
    );
}

// ==================================================
// 新しい箱追加
// ==================================================

function addNewBox() {
    const offset =
        boxes.length * 0.35;

    boxes.push({
        center: [
            0.6,
            0,
            -1.5 - offset
        ],

        colorName: "blue",

        color:
            COLORS.blue,

        scale: 1.0,

        rotationY: 0
    });

    selectedBoxIndex =
        boxes.length - 1;
}

// ==================================================
// ゴール判定
// ==================================================

function checkGoal() {
    gameCleared =
        false;

    for (
        const box
        of boxes
    ) {
        if (
            box.colorName !== "red"
        ) {
            continue;
        }

        const dx =
            Math.abs(
                box.center[0] -
                GOAL_CENTER[0]
            );

        const dy =
            Math.abs(
                box.center[1] -
                GOAL_CENTER[1]
            );

        const dz =
            Math.abs(
                box.center[2] -
                GOAL_CENTER[2]
            );

        const allowed =
            GOAL_HALF -
            BOX_HALF *
            box.scale;

        if (
            allowed > 0 &&
            dx <= allowed &&
            dy <= allowed &&
            dz <= 0.25
        ) {
            gameCleared =
                true;

            status.textContent =
                "正解！ 赤い箱をゴールに置けました。";

            return;
        }
    }

    status.textContent =
        "赤い箱を赤い枠の中へ移動してください。";
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

    if (
        isDragging &&
        activeInputSource &&
        activeBoxIndex !== null
    ) {
        const ray =
            getRay(
                frame,
                activeInputSource
            );

        if (ray) {
            boxes[
                activeBoxIndex
            ].center = [
                ray.origin[0] +
                ray.direction[0] *
                dragDistance,

                ray.origin[1] +
                ray.direction[1] *
                dragDistance,

                ray.origin[2] +
                ray.direction[2] *
                dragDistance
            ];

            currentRay =
                ray;
        }
    } else {
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

        drawGoal(view);
        drawBoxes(view);
        drawButtons(view);

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

            status.textContent =
                "赤い箱を赤い枠の中へ移動してください。";

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

                    if (
                        target.type ===
                        "add"
                    ) {
                        addNewBox();
                        return;
                    }

                    if (
                        target.type ===
                        "scaleUp"
                    ) {
                        if (
                            boxes[
                                selectedBoxIndex
                            ]
                        ) {
                            boxes[
                                selectedBoxIndex
                            ].scale =
                                Math.min(
                                    2.5,
                                    boxes[
                                        selectedBoxIndex
                                    ].scale +
                                    0.2
                                );
                        }

                        return;
                    }

                    if (
                        target.type ===
                        "scaleDown"
                    ) {
                        if (
                            boxes[
                                selectedBoxIndex
                            ]
                        ) {
                            boxes[
                                selectedBoxIndex
                            ].scale =
                                Math.max(
                                    0.4,
                                    boxes[
                                        selectedBoxIndex
                                    ].scale -
                                    0.2
                                );
                        }

                        return;
                    }

                    if (
                        target.type ===
                        "box"
                    ) {
                        selectedBoxIndex =
                            target.index;

                        activeBoxIndex =
                            target.index;

                        activeInputSource =
                            event.inputSource;

                        pressStartTime =
                            performance.now();

                        pressStartCenter =
                            [
                                ...boxes[
                                    target.index
                                ].center
                            ];

                        const center =
                            boxes[
                                target.index
                            ].center;

                        const toCenter = [
                            center[0] -
                            ray.origin[0],

                            center[1] -
                            ray.origin[1],

                            center[2] -
                            ray.origin[2]
                        ];

                        dragDistance =
                            Math.max(
                                0.3,

                                Math.min(
                                    dot(
                                        toCenter,
                                        ray.direction
                                    ),
                                    3.0
                                )
                            );

                        isDragging =
                            true;
                    }
                }
            );

            xrSession.addEventListener(
                "selectend",
                (event) => {
                    if (
                        event.inputSource !==
                        activeInputSource
                    ) {
                        return;
                    }

                    const duration =
                        performance.now() -
                        pressStartTime;

                    const box =
                        boxes[
                            activeBoxIndex
                        ];

                    if (
                        box &&
                        duration < 350 &&
                        pressStartCenter
                    ) {
                        const dx =
                            box.center[0] -
                            pressStartCenter[0];

                        const dy =
                            box.center[1] -
                            pressStartCenter[1];

                        const dz =
                            box.center[2] -
                            pressStartCenter[2];

                        const moved =
                            Math.hypot(
                                dx,
                                dy,
                                dz
                            );

                        if (moved < 0.08) {
                            box.center =
                                [
                                    ...pressStartCenter
                                ];

                            box.rotationY +=
                                Math.PI / 4;
                        }
                    }

                    isDragging =
                        false;

                    activeInputSource =
                        null;

                    activeBoxIndex =
                        null;

                    pressStartCenter =
                        null;

                    checkGoal();
                }
            );

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

checkXR();