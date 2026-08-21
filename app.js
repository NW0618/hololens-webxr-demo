const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;
let gl = null;
let xrRefSpace = null;
let program = null;

let meshes = {};
let rayBuffer = null;

// ==================================================
// 基本設定
// ==================================================

const BOX_HALF = 0.15;

const COLORS = {
    red: [1.0, 0.2, 0.2, 1.0],
    blue: [0.2, 0.6, 1.0, 1.0],
    green: [0.2, 1.0, 0.3, 1.0],
    white: [1.0, 1.0, 1.0, 1.0],
    gray: [0.55, 0.55, 0.60, 1.0],
    panel: [0.10, 0.10, 0.12, 1.0],
    buttonHover: [0.85, 0.85, 0.90, 1.0]
};

// ==================================================
// 問題設定
// 今回の問題：青い球体を2個、ゴールへ入れる
// ==================================================

const TASK = {
    colorName: "blue",
    shape: "sphere",
    requiredCount: 2
};

let gameCleared = false;
let correctCount = 0;

// ==================================================
// 初期オブジェクト：1個だけ
// ==================================================

let boxes = [
    {
        center: [0.0, 0.0, -1.5],
        shape: "cube",
        colorName: "blue",
        color: COLORS.blue,
        scale: 1.0,
        rotationX: 0,
        rotationY: 0
    }
];

let selectedBoxIndex = null;

// ==================================================
// ゴール
// 2個を並べて入れやすいよう少し大きくする
// ==================================================

const GOAL_CENTER = [0.0, -0.48, -1.5];
const GOAL_HALF = 0.50;
const GOAL_DEPTH_TOLERANCE = 0.75;

// ==================================================
// 問題表示パネル（MR空間内）
// 青い球体 × 2 を図形で表示
// ==================================================

const TASK_PANEL_CENTER = [0.0, 0.48, -1.32];

// ==================================================
// オブジェクト追加ボタン：中央
// ==================================================

const ADD_CENTER = [0.0, 0.72, -1.25];
const ADD_HALF = 0.16;

// ==================================================
// 移動状態
// ==================================================

let hoverTarget = null;
let isDragging = false;
let activeInputSource = null;
let activeBoxIndex = null;
let dragDistance = 1.5;
let pressStartTime = 0;
let pressStartCenter = null;

// ==================================================
// 回転状態
// ==================================================

let isRotating = false;
let rotationMode = null;
let rotationInputSource = null;
let rotationStartRayAngle = 0;
let rotationStartObjectAngle = 0;

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
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    const shaderProgram = gl.createProgram();

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(shaderProgram));
    }

    return shaderProgram;
}

// ==================================================
// メッシュ作成
// ==================================================

function createMesh(vertices, indices) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    return {
        positionBuffer,
        indexBuffer,
        count: indices.length
    };
}

function createCubeMesh() {
    const vertices = [
        -1, -1, -1,
         1, -1, -1,
         1,  1, -1,
        -1,  1, -1,
        -1, -1,  1,
         1, -1,  1,
         1,  1,  1,
        -1,  1,  1
    ];

    const indices = [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        3, 2, 6, 3, 6, 7,
        1, 5, 6, 1, 6, 2,
        0, 3, 7, 0, 7, 4
    ];

    return createMesh(vertices, indices);
}

function createSphereMesh() {
    const vertices = [];
    const indices = [];
    const latitudeSegments = 12;
    const longitudeSegments = 16;

    for (let lat = 0; lat <= latitudeSegments; lat++) {
        const theta = lat * Math.PI / latitudeSegments;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= longitudeSegments; lon++) {
            const phi = lon * Math.PI * 2 / longitudeSegments;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            vertices.push(
                sinTheta * cosPhi,
                cosTheta,
                sinTheta * sinPhi
            );
        }
    }

    for (let lat = 0; lat < latitudeSegments; lat++) {
        for (let lon = 0; lon < longitudeSegments; lon++) {
            const first = lat * (longitudeSegments + 1) + lon;
            const second = first + longitudeSegments + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    return createMesh(vertices, indices);
}

function createTetraMesh() {
    const vertices = [
         1,  1,  1,
        -1, -1,  1,
        -1,  1, -1,
         1, -1, -1
    ];

    const indices = [
        0, 1, 2,
        0, 3, 1,
        0, 2, 3,
        1, 3, 2
    ];

    return createMesh(vertices, indices);
}

function createGeometry() {
    meshes.cube = createCubeMesh();
    meshes.sphere = createSphereMesh();
    meshes.tetra = createTetraMesh();
    rayBuffer = gl.createBuffer();
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

function modelMatrix(center, size, rotationX, rotationY) {
    const cx = Math.cos(rotationX);
    const sx = Math.sin(rotationX);
    const cy = Math.cos(rotationY);
    const sy = Math.sin(rotationY);

    return new Float32Array([
        cy * size, 0, -sy * size, 0,
        sy * sx * size, cx * size, cy * sx * size, 0,
        sy * cx * size, -sx * size, cy * cx * size, 0,
        center[0], center[1], center[2], 1
    ]);
}

function objectMatrix(box) {
    const size = BOX_HALF * box.scale;
    return modelMatrix(
        box.center,
        size,
        box.rotationX,
        box.rotationY
    );
}

function shapeMatrix(center, sx, sy, sz, rotationZ = 0) {
    const c = Math.cos(rotationZ);
    const s = Math.sin(rotationZ);

    return new Float32Array([
         c * sx, s * sx, 0, 0,
        -s * sy, c * sy, 0, 0,
         0,      0,      sz, 0,
         center[0], center[1], center[2], 1
    ]);
}

// ==================================================
// ベクトル
// ==================================================

function transformDirection(matrix, x, y, z) {
    return [
        matrix[0] * x + matrix[4] * y + matrix[8] * z,
        matrix[1] * x + matrix[5] * y + matrix[9] * z,
        matrix[2] * x + matrix[6] * y + matrix[10] * z
    ];
}

function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]);

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
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeAngleDelta(angle) {
    while (angle > Math.PI) {
        angle -= Math.PI * 2;
    }

    while (angle < -Math.PI) {
        angle += Math.PI * 2;
    }

    return angle;
}

function getHorizontalRayAngle(direction) {
    return Math.atan2(direction[0], -direction[2]);
}

function getVerticalRayAngle(direction) {
    return Math.atan2(
        direction[1],
        Math.hypot(direction[0], direction[2])
    );
}

// ==================================================
// レイとAABB
// ==================================================

function rayBoxDistance(origin, direction, center, half) {
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
        if (Math.abs(direction[i]) < 0.000001) {
            if (origin[i] < min[i] || origin[i] > max[i]) {
                return null;
            }
        } else {
            const t1 = (min[i] - origin[i]) / direction[i];
            const t2 = (max[i] - origin[i]) / direction[i];
            const near = Math.min(t1, t2);
            const far = Math.max(t1, t2);

            tmin = Math.max(tmin, near);
            tmax = Math.min(tmax, far);

            if (tmin > tmax) {
                return null;
            }
        }
    }

    if (tmax < 0) {
        return null;
    }

    return tmin >= 0 ? tmin : tmax;
}

// ==================================================
// 操作パネル
// ==================================================

function getPanelLayout() {
    if (
        selectedBoxIndex === null ||
        !boxes[selectedBoxIndex]
    ) {
        return null;
    }

    const box = boxes[selectedBoxIndex];
    const objectHalf = BOX_HALF * box.scale;
    const panelX = box.center[0] + objectHalf + 0.50;
    const panelY = box.center[1];
    const panelZ = box.center[2] + 0.04;

    const sizeY = panelY + 0.30;
    const rotateY = panelY + 0.10;
    const colorY = panelY - 0.10;
    const shapeY = panelY - 0.30;

    return {
        center: [panelX, panelY, panelZ],

        sizeMinus: [panelX - 0.13, sizeY, panelZ + 0.04],
        sizePlus: [panelX + 0.13, sizeY, panelZ + 0.04],

        rotateVertical: [panelX - 0.13, rotateY, panelZ + 0.04],
        rotateHorizontal: [panelX + 0.13, rotateY, panelZ + 0.04],

        red: [panelX - 0.17, colorY, panelZ + 0.04],
        blue: [panelX, colorY, panelZ + 0.04],
        green: [panelX + 0.17, colorY, panelZ + 0.04],

        cube: [panelX - 0.17, shapeY, panelZ + 0.04],
        sphere: [panelX, shapeY, panelZ + 0.04],
        tetra: [panelX + 0.17, shapeY, panelZ + 0.04],

        // 削除ボタン：操作パネル右上
        deleteButton: [panelX + 0.24, panelY + 0.50, panelZ + 0.06]
    };
}

// ==================================================
// 操作対象検索
// ==================================================

function findNearestTarget(origin, direction) {
    let result = null;

    const addDistance = rayBoxDistance(
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

    const panel = getPanelLayout();

    if (panel) {
        const controls = [
            { type: "sizeMinus", center: panel.sizeMinus },
            { type: "sizePlus", center: panel.sizePlus },
            { type: "rotateVertical", center: panel.rotateVertical },
            { type: "rotateHorizontal", center: panel.rotateHorizontal },
            { type: "colorRed", center: panel.red },
            { type: "colorBlue", center: panel.blue },
            { type: "colorGreen", center: panel.green },
            { type: "shapeCube", center: panel.cube },
            { type: "shapeSphere", center: panel.sphere },
            { type: "shapeTetra", center: panel.tetra },
            { type: "deleteObject", center: panel.deleteButton }
        ];

        for (const control of controls) {
            const distance = rayBoxDistance(
                origin,
                direction,
                control.center,
                0.09
            );

            if (
                distance !== null &&
                (
                    result === null ||
                    distance < result.distance
                )
            ) {
                result = {
                    type: control.type,
                    distance
                };
            }
        }
    }

    for (let i = 0; i < boxes.length; i++) {
        const half = BOX_HALF * boxes[i].scale;
        const distance = rayBoxDistance(
            origin,
            direction,
            boxes[i].center,
            half
        );

        if (
            distance !== null &&
            (
                result === null ||
                distance < result.distance
            )
        ) {
            result = {
                type: "box",
                index: i,
                distance
            };
        }
    }

    return result;
}

// ==================================================
// XR入力レイ
// ==================================================

function getRay(frame, inputSource) {
    const pose = frame.getPose(
        inputSource.targetRaySpace,
        xrRefSpace
    );

    if (!pose) {
        return null;
    }

    const matrix = pose.transform.matrix;

    const origin = [
        matrix[12],
        matrix[13],
        matrix[14]
    ];

    const direction = normalize(
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
// メッシュ描画
// ==================================================

function drawMesh(view, mesh, matrix, color) {
    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const projectionLocation = gl.getUniformLocation(program, "uProjectionMatrix");
    const viewLocation = gl.getUniformLocation(program, "uViewMatrix");
    const modelLocation = gl.getUniformLocation(program, "uModelMatrix");
    const colorLocation = gl.getUniformLocation(program, "uColor");

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);

    gl.uniformMatrix4fv(projectionLocation, false, view.projectionMatrix);
    gl.uniformMatrix4fv(viewLocation, false, view.transform.inverse.matrix);
    gl.uniformMatrix4fv(modelLocation, false, matrix);
    gl.uniform4fv(colorLocation, color);

    gl.drawElements(
        gl.TRIANGLES,
        mesh.count,
        gl.UNSIGNED_SHORT,
        0
    );
}

function drawShape(view, matrix, color) {
    drawMesh(
        view,
        meshes.cube,
        matrix,
        color
    );
}

// ==================================================
// 外枠
// ==================================================

function drawFrame(
    view,
    center,
    half,
    color,
    depthOffset = 0
) {
    const t = 0.010;
    const z = center[2] + depthOffset;

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1] + half, z],
            half,
            t,
            t
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1] - half, z],
            half,
            t,
            t
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0] - half, center[1], z],
            t,
            half,
            t
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0] + half, center[1], z],
            t,
            half,
            t
        ),
        color
    );
}

function drawObjectOutline(view, box, color) {
    const h = BOX_HALF * box.scale + 0.025;
    const t = 0.010;
    const x = box.center[0];
    const y = box.center[1];
    const z = box.center[2];

    for (const yy of [-h, h]) {
        for (const zz of [-h, h]) {
            drawShape(
                view,
                shapeMatrix(
                    [x, y + yy, z + zz],
                    h,
                    t,
                    t
                ),
                color
            );
        }
    }

    for (const xx of [-h, h]) {
        for (const zz of [-h, h]) {
            drawShape(
                view,
                shapeMatrix(
                    [x + xx, y, z + zz],
                    t,
                    h,
                    t
                ),
                color
            );
        }
    }

    for (const xx of [-h, h]) {
        for (const yy of [-h, h]) {
            drawShape(
                view,
                shapeMatrix(
                    [x + xx, y + yy, z],
                    t,
                    t,
                    h
                ),
                color
            );
        }
    }
}

// ==================================================
// オブジェクト描画
// ==================================================

function drawObjects(view) {
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const mesh = meshes[box.shape] || meshes.cube;

        drawMesh(
            view,
            mesh,
            objectMatrix(box),
            box.color
        );

        let outlineColor = null;

        if (
            isDragging &&
            activeBoxIndex === i
        ) {
            outlineColor = COLORS.green;
        } else if (
            isRotating &&
            selectedBoxIndex === i
        ) {
            outlineColor = COLORS.green;
        } else if (
            selectedBoxIndex === i
        ) {
            outlineColor = COLORS.white;
        } else if (
            hoverTarget &&
            hoverTarget.type === "box" &&
            hoverTarget.index === i
        ) {
            outlineColor = COLORS.gray;
        }

        if (outlineColor) {
            drawObjectOutline(
                view,
                box,
                outlineColor
            );
        }
    }
}

// ==================================================
// 問題判定
// ==================================================

function isInsideGoal(box) {
    const objectHalf = BOX_HALF * box.scale;
    // 見た目では枠内に入っていても、手前/奥方向の差で
    // 不正解になりにくいよう、少し余裕を持たせる。
    const allowed = GOAL_HALF - objectHalf + 0.05;

    if (allowed <= 0) {
        return false;
    }

    const dx = Math.abs(
        box.center[0] - GOAL_CENTER[0]
    );

    const dy = Math.abs(
        box.center[1] - GOAL_CENTER[1]
    );

    const dz = Math.abs(
        box.center[2] - GOAL_CENTER[2]
    );

    return (
        dx <= allowed &&
        dy <= allowed &&
        dz <= GOAL_DEPTH_TOLERANCE
    );
}

function updateTaskState() {
    correctCount = 0;

    for (const box of boxes) {
        if (
            box.colorName === TASK.colorName &&
            box.shape === TASK.shape &&
            isInsideGoal(box)
        ) {
            correctCount++;
        }
    }

    gameCleared =
        correctCount >=
        TASK.requiredCount;

    if (gameCleared) {
        status.textContent =
            "CLEAR! 青い球体を2個、枠の中に置けました。";
    } else {
        const remaining =
            TASK.requiredCount -
            correctCount;

        status.textContent =
            "問題：青い球体を2個、青い枠の中へ入れてください。残り " +
            remaining +
            " 個です。";
    }
}

// ==================================================
// ゴール描画
// 青い問題なので通常時は青、クリアで緑
// ==================================================

function drawGoal(view) {
    const color = gameCleared
        ? COLORS.green
        : COLORS.blue;

    const x = GOAL_CENTER[0];
    const y = GOAL_CENTER[1];
    const z = GOAL_CENTER[2];
    const h = GOAL_HALF;
    const t = 0.025;

    drawShape(
        view,
        shapeMatrix(
            [x, y + h, z],
            h,
            t,
            t
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [x, y - h, z],
            h,
            t,
            t
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [x - h, y, z],
            t,
            h,
            t
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [x + h, y, z],
            t,
            h,
            t
        ),
        color
    );
}

// ==================================================
// 問題表示用の簡易文字・図形
// ==================================================

function drawXMark(view, center, color) {
    drawShape(
        view,
        shapeMatrix(
            center,
            0.045,
            0.010,
            0.020,
            Math.PI / 4
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            center,
            0.045,
            0.010,
            0.020,
            -Math.PI / 4
        ),
        color
    );
}

function drawDigitTwo(view, center, color) {
    const w = 0.055;
    const h = 0.050;
    const t = 0.010;

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1] + h, center[2]],
            w,
            t,
            0.020
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0] + w, center[1] + h / 2, center[2]],
            t,
            h / 2,
            0.020
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1], center[2]],
            w,
            t,
            0.020
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0] - w, center[1] - h / 2, center[2]],
            t,
            h / 2,
            0.020
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1] - h, center[2]],
            w,
            t,
            0.020
        ),
        color
    );
}

function drawCheckMark(view, center, color) {
    drawShape(
        view,
        shapeMatrix(
            [center[0] - 0.035, center[1] - 0.015, center[2]],
            0.045,
            0.012,
            0.020,
            -Math.PI / 4
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0] + 0.035, center[1] + 0.020, center[2]],
            0.070,
            0.012,
            0.020,
            Math.PI / 4
        ),
        color
    );
}

function drawTaskPanel(view) {
    const panelColor = gameCleared
        ? [0.08, 0.25, 0.10, 1.0]
        : COLORS.panel;

    drawShape(
        view,
        shapeMatrix(
            TASK_PANEL_CENTER,
            0.30,
            0.11,
            0.018
        ),
        panelColor
    );

    if (gameCleared) {
        drawCheckMark(
            view,
            [
                TASK_PANEL_CENTER[0],
                TASK_PANEL_CENTER[1],
                TASK_PANEL_CENTER[2] + 0.04
            ],
            COLORS.green
        );
        return;
    }

    drawMesh(
        view,
        meshes.sphere,
        modelMatrix(
            [
                TASK_PANEL_CENTER[0] - 0.15,
                TASK_PANEL_CENTER[1],
                TASK_PANEL_CENTER[2] + 0.04
            ],
            0.060,
            0,
            0
        ),
        COLORS.blue
    );

    drawXMark(
        view,
        [
            TASK_PANEL_CENTER[0] + 0.015,
            TASK_PANEL_CENTER[1],
            TASK_PANEL_CENTER[2] + 0.04
        ],
        COLORS.white
    );

    drawDigitTwo(
        view,
        [
            TASK_PANEL_CENTER[0] + 0.16,
            TASK_PANEL_CENTER[1],
            TASK_PANEL_CENTER[2] + 0.04
        ],
        COLORS.white
    );
}

// ==================================================
// ＋ / －
// ==================================================

function drawPlus(view, center, color) {
    drawShape(
        view,
        shapeMatrix(
            center,
            0.075,
            0.018,
            0.025
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            center,
            0.018,
            0.075,
            0.025
        ),
        color
    );
}

function drawMinus(view, center, color) {
    drawShape(
        view,
        shapeMatrix(
            center,
            0.075,
            0.018,
            0.025
        ),
        color
    );
}

// ==================================================
// 回転アイコン
// ==================================================

function drawRotationHandle(
    view,
    center,
    axis,
    color
) {
    if (axis === "vertical") {
        drawShape(
            view,
            shapeMatrix(
                center,
                0.014,
                0.075,
                0.025
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] - 0.025, center[1] + 0.055, center[2]],
                0.035,
                0.010,
                0.025,
                Math.PI / 4
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] + 0.025, center[1] + 0.055, center[2]],
                0.035,
                0.010,
                0.025,
                -Math.PI / 4
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] - 0.025, center[1] - 0.055, center[2]],
                0.035,
                0.010,
                0.025,
                -Math.PI / 4
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] + 0.025, center[1] - 0.055, center[2]],
                0.035,
                0.010,
                0.025,
                Math.PI / 4
            ),
            color
        );
    } else {
        drawShape(
            view,
            shapeMatrix(
                center,
                0.075,
                0.014,
                0.025
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] - 0.055, center[1] + 0.025, center[2]],
                0.035,
                0.010,
                0.025,
                Math.PI / 4
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] - 0.055, center[1] - 0.025, center[2]],
                0.035,
                0.010,
                0.025,
                -Math.PI / 4
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] + 0.055, center[1] + 0.025, center[2]],
                0.035,
                0.010,
                0.025,
                -Math.PI / 4
            ),
            color
        );

        drawShape(
            view,
            shapeMatrix(
                [center[0] + 0.055, center[1] - 0.025, center[2]],
                0.035,
                0.010,
                0.025,
                Math.PI / 4
            ),
            color
        );
    }
}

function normalControlColor(type) {
    if (
        isRotating &&
        (
            (
                type === "rotateVertical" &&
                rotationMode === "vertical"
            ) ||
            (
                type === "rotateHorizontal" &&
                rotationMode === "horizontal"
            )
        )
    ) {
        return COLORS.green;
    }

    if (
        hoverTarget &&
        hoverTarget.type === type
    ) {
        return COLORS.buttonHover;
    }

    return COLORS.white;
}

function drawSelectionFrame(view, center, color) {
    drawFrame(
        view,
        center,
        0.070,
        color,
        0.012
    );
}

function drawShapeIcon(
    view,
    center,
    shape,
    color
) {
    drawMesh(
        view,
        meshes[shape],
        modelMatrix(
            center,
            0.055,
            -0.25,
            0.35
        ),
        color
    );
}

// ==================================================
// 操作パネル描画
// ==================================================

function drawDeleteButton(view, center) {
    drawShape(
        view,
        shapeMatrix(center, 0.080, 0.080, 0.030),
        COLORS.red
    );

    const z = center[2] + 0.040;

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1], z],
            0.065, 0.012, 0.012,
            Math.PI / 4
        ),
        COLORS.white
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1], z],
            0.065, 0.012, 0.012,
            -Math.PI / 4
        ),
        COLORS.white
    );

    if (
        hoverTarget &&
        hoverTarget.type === "deleteObject"
    ) {
        drawSelectionFrame(view, center, COLORS.gray);
    }
}

// ==================================================
// 操作パネル
// ==================================================

function drawControlPanel(view) {
    const panel = getPanelLayout();

    if (!panel) {
        return;
    }

    drawShape(
        view,
        shapeMatrix(
            panel.center,
            0.32,
            0.60,
            0.018
        ),
        COLORS.panel
    );

    // 右上の赤い×削除ボタン
    drawDeleteButton(view, panel.deleteButton);

    drawMinus(
        view,
        panel.sizeMinus,
        normalControlColor("sizeMinus")
    );

    drawPlus(
        view,
        panel.sizePlus,
        normalControlColor("sizePlus")
    );

    drawRotationHandle(
        view,
        panel.rotateVertical,
        "vertical",
        normalControlColor("rotateVertical")
    );

    drawRotationHandle(
        view,
        panel.rotateHorizontal,
        "horizontal",
        normalControlColor("rotateHorizontal")
    );

    // 色ボタンは固定色
    drawShape(
        view,
        shapeMatrix(panel.red, 0.055, 0.055, 0.025),
        COLORS.red
    );

    drawShape(
        view,
        shapeMatrix(panel.blue, 0.055, 0.055, 0.025),
        COLORS.blue
    );

    drawShape(
        view,
        shapeMatrix(panel.green, 0.055, 0.055, 0.025),
        COLORS.green
    );

    // 形状ボタン
    drawShapeIcon(
        view,
        panel.cube,
        "cube",
        COLORS.white
    );

    drawShapeIcon(
        view,
        panel.sphere,
        "sphere",
        COLORS.white
    );

    drawShapeIcon(
        view,
        panel.tetra,
        "tetra",
        COLORS.white
    );

    const box = boxes[selectedBoxIndex];

    if (!box) {
        return;
    }

    // 現在色
    if (box.colorName === "red") {
        drawSelectionFrame(view, panel.red, COLORS.white);
    }

    if (box.colorName === "blue") {
        drawSelectionFrame(view, panel.blue, COLORS.white);
    }

    if (box.colorName === "green") {
        drawSelectionFrame(view, panel.green, COLORS.white);
    }

    // 色ホバー
    if (hoverTarget && hoverTarget.type === "colorRed") {
        drawSelectionFrame(view, panel.red, COLORS.gray);
    }

    if (hoverTarget && hoverTarget.type === "colorBlue") {
        drawSelectionFrame(view, panel.blue, COLORS.gray);
    }

    if (hoverTarget && hoverTarget.type === "colorGreen") {
        drawSelectionFrame(view, panel.green, COLORS.gray);
    }

    // 現在形状
    if (box.shape === "cube") {
        drawSelectionFrame(view, panel.cube, COLORS.white);
    }

    if (box.shape === "sphere") {
        drawSelectionFrame(view, panel.sphere, COLORS.white);
    }

    if (box.shape === "tetra") {
        drawSelectionFrame(view, panel.tetra, COLORS.white);
    }

    // 形状ホバー
    if (hoverTarget && hoverTarget.type === "shapeCube") {
        drawSelectionFrame(view, panel.cube, COLORS.gray);
    }

    if (hoverTarget && hoverTarget.type === "shapeSphere") {
        drawSelectionFrame(view, panel.sphere, COLORS.gray);
    }

    if (hoverTarget && hoverTarget.type === "shapeTetra") {
        drawSelectionFrame(view, panel.tetra, COLORS.gray);
    }
}

// ==================================================
// 追加アイコン
// ==================================================

function drawAddButton(view) {
    const color =
        (
            hoverTarget &&
            hoverTarget.type === "add"
        )
            ? COLORS.buttonHover
            : COLORS.green;

    drawShape(
        view,
        shapeMatrix(
            [
                ADD_CENTER[0] - 0.055,
                ADD_CENTER[1] - 0.035,
                ADD_CENTER[2]
            ],
            0.075,
            0.075,
            0.055
        ),
        color
    );

    drawShape(
        view,
        shapeMatrix(
            [
                ADD_CENTER[0] + 0.055,
                ADD_CENTER[1] + 0.035,
                ADD_CENTER[2] - 0.025
            ],
            0.075,
            0.075,
            0.055
        ),
        color
    );
}

// ==================================================
// レイ
// ==================================================

function drawRay(view, origin, direction) {
    const rayLength = 2.5;

    const end = [
        origin[0] + direction[0] * rayLength,
        origin[1] + direction[1] * rayLength,
        origin[2] + direction[2] * rayLength
    ];

    const vertices = new Float32Array([
        origin[0],
        origin[1],
        origin[2],
        end[0],
        end[1],
        end[2]
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, rayBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const projectionLocation = gl.getUniformLocation(program, "uProjectionMatrix");
    const viewLocation = gl.getUniformLocation(program, "uViewMatrix");
    const modelLocation = gl.getUniformLocation(program, "uModelMatrix");
    const colorLocation = gl.getUniformLocation(program, "uColor");

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(projectionLocation, false, view.projectionMatrix);
    gl.uniformMatrix4fv(viewLocation, false, view.transform.inverse.matrix);
    gl.uniformMatrix4fv(modelLocation, false, identityMatrix());

    const rayColor =
        (
            isDragging ||
            isRotating
        )
            ? COLORS.green
            : COLORS.white;

    gl.uniform4fv(colorLocation, rayColor);
    gl.drawArrays(gl.LINES, 0, 2);
}

// ==================================================
// 選択中オブジェクト削除
// ==================================================

function deleteSelectedObject() {
    if (
        selectedBoxIndex === null ||
        !boxes[selectedBoxIndex]
    ) {
        return;
    }

    const deleteIndex = selectedBoxIndex;

    boxes.splice(
        deleteIndex,
        1
    );

    isDragging = false;
    activeInputSource = null;
    activeBoxIndex = null;
    pressStartCenter = null;

    isRotating = false;
    rotationMode = null;
    rotationInputSource = null;

    // 削除後は選択解除して操作パネルを閉じる
    selectedBoxIndex = null;

    updateTaskState();
}


// ==================================================
// オブジェクト追加
// 初期1個前提の配置
// ==================================================

function addNewObject() {
    const offset = Math.max(
        0,
        boxes.length - 1
    ) * 0.18;

    boxes.push({
        center: [
            0.0,
            0.20,
            -1.80 - offset
        ],
        shape: "cube",
        colorName: "blue",
        color: COLORS.blue,
        scale: 1.0,
        rotationX: 0,
        rotationY: 0
    });

    selectedBoxIndex =
        boxes.length - 1;

    updateTaskState();
}

// ==================================================
// XRフレーム
// ==================================================

function onXRFrame(time, frame) {
    const session = frame.session;

    session.requestAnimationFrame(
        onXRFrame
    );

    const viewerPose = frame.getViewerPose(
        xrRefSpace
    );

    if (!viewerPose) {
        return;
    }

    let currentRay = null;

    // 移動中
    if (
        isDragging &&
        activeInputSource &&
        activeBoxIndex !== null
    ) {
        const ray = getRay(
            frame,
            activeInputSource
        );

        if (ray) {
            boxes[activeBoxIndex].center = [
                ray.origin[0] + ray.direction[0] * dragDistance,
                ray.origin[1] + ray.direction[1] * dragDistance,
                ray.origin[2] + ray.direction[2] * dragDistance
            ];

            currentRay = ray;
        }
    }

    // 回転中
    else if (
        isRotating &&
        rotationInputSource &&
        selectedBoxIndex !== null
    ) {
        const ray = getRay(
            frame,
            rotationInputSource
        );

        if (ray) {
            currentRay = ray;
            const box = boxes[selectedBoxIndex];

            if (rotationMode === "horizontal") {
                const angle = getHorizontalRayAngle(ray.direction);
                const delta = normalizeAngleDelta(
                    angle - rotationStartRayAngle
                );

                box.rotationY =
                    rotationStartObjectAngle +
                    delta;
            }

            if (rotationMode === "vertical") {
                const angle = getVerticalRayAngle(ray.direction);
                const delta = normalizeAngleDelta(
                    angle - rotationStartRayAngle
                );

                box.rotationX =
                    rotationStartObjectAngle -
                    delta;
            }
        }
    }

    // 通常
    else {
        for (const inputSource of session.inputSources) {
            const ray = getRay(
                frame,
                inputSource
            );

            if (ray) {
                currentRay = ray;
                break;
            }
        }

        hoverTarget = null;

        if (currentRay) {
            hoverTarget = findNearestTarget(
                currentRay.origin,
                currentRay.direction
            );
        }
    }

    gl.bindFramebuffer(
        gl.FRAMEBUFFER,
        session.renderState.baseLayer.framebuffer
    );

    gl.clearColor(0, 0, 0, 0);

    gl.clear(
        gl.COLOR_BUFFER_BIT |
        gl.DEPTH_BUFFER_BIT
    );

    for (const view of viewerPose.views) {
        const viewport =
            session.renderState.baseLayer.getViewport(view);

        gl.viewport(
            viewport.x,
            viewport.y,
            viewport.width,
            viewport.height
        );

        drawGoal(view);
        drawObjects(view);
        drawAddButton(view);
        drawTaskPanel(view);
        drawControlPanel(view);

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
        await navigator.xr.isSessionSupported(
            "immersive-ar"
        );

    if (supported) {
        xrButton.disabled = false;
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
                await navigator.xr.requestSession(
                    "immersive-ar"
                );

            const canvas =
                document.createElement("canvas");

            gl = canvas.getContext(
                "webgl",
                {
                    xrCompatible: true,
                    alpha: true
                }
            );

            if (!gl) {
                throw new Error(
                    "WebGLを開始できませんでした。"
                );
            }

            await gl.makeXRCompatible();

            xrSession.updateRenderState({
                baseLayer: new XRWebGLLayer(
                    xrSession,
                    gl
                )
            });

            xrRefSpace =
                await xrSession.requestReferenceSpace(
                    "local"
                );

            program = createProgram();
            createGeometry();
            gl.enable(gl.DEPTH_TEST);

            updateTaskState();

            // ==================================================
            // 選択開始
            // ==================================================

            xrSession.addEventListener(
                "selectstart",
                (event) => {
                    const ray = getRay(
                        event.frame,
                        event.inputSource
                    );

                    if (!ray) {
                        return;
                    }

                    const target = findNearestTarget(
                        ray.origin,
                        ray.direction
                    );

                    if (!target) {
                        return;
                    }

                    if (target.type === "add") {
                        addNewObject();
                        return;
                    }

                    if (target.type === "deleteObject") {
                        deleteSelectedObject();
                        return;
                    }

                    if (target.type === "sizeMinus") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.scale = Math.max(
                                0.4,
                                box.scale - 0.2
                            );
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "sizePlus") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.scale = Math.min(
                                2.5,
                                box.scale + 0.2
                            );
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "rotateVertical") {
                        const box = boxes[selectedBoxIndex];

                        if (!box) {
                            return;
                        }

                        isRotating = true;
                        rotationMode = "vertical";
                        rotationInputSource = event.inputSource;
                        rotationStartRayAngle = getVerticalRayAngle(
                            ray.direction
                        );
                        rotationStartObjectAngle = box.rotationX;
                        return;
                    }

                    if (target.type === "rotateHorizontal") {
                        const box = boxes[selectedBoxIndex];

                        if (!box) {
                            return;
                        }

                        isRotating = true;
                        rotationMode = "horizontal";
                        rotationInputSource = event.inputSource;
                        rotationStartRayAngle = getHorizontalRayAngle(
                            ray.direction
                        );
                        rotationStartObjectAngle = box.rotationY;
                        return;
                    }

                    if (target.type === "colorRed") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.colorName = "red";
                            box.color = COLORS.red;
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "colorBlue") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.colorName = "blue";
                            box.color = COLORS.blue;
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "colorGreen") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.colorName = "green";
                            box.color = COLORS.green;
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "shapeCube") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.shape = "cube";
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "shapeSphere") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.shape = "sphere";
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "shapeTetra") {
                        const box = boxes[selectedBoxIndex];

                        if (box) {
                            box.shape = "tetra";
                            updateTaskState();
                        }

                        return;
                    }

                    if (target.type === "box") {
                        selectedBoxIndex = target.index;
                        activeBoxIndex = target.index;
                        activeInputSource = event.inputSource;
                        pressStartTime = performance.now();
                        pressStartCenter = [
                            ...boxes[target.index].center
                        ];

                        const center =
                            boxes[target.index].center;

                        const toCenter = [
                            center[0] - ray.origin[0],
                            center[1] - ray.origin[1],
                            center[2] - ray.origin[2]
                        ];

                        dragDistance = Math.max(
                            0.3,
                            Math.min(
                                dot(
                                    toCenter,
                                    ray.direction
                                ),
                                3.0
                            )
                        );

                        isDragging = true;
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
                        isRotating &&
                        event.inputSource ===
                        rotationInputSource
                    ) {
                        isRotating = false;
                        rotationMode = null;
                        rotationInputSource = null;
                        rotationStartRayAngle = 0;
                        rotationStartObjectAngle = 0;
                        updateTaskState();
                        return;
                    }

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
                        boxes[activeBoxIndex];

                    if (
                        box &&
                        duration < 300 &&
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
                            box.center = [
                                ...pressStartCenter
                            ];
                        }
                    }

                    isDragging = false;
                    activeInputSource = null;
                    activeBoxIndex = null;
                    pressStartCenter = null;

                    updateTaskState();
                }
            );

            // ==================================================
            // MR終了
            // ==================================================

            xrSession.addEventListener(
                "end",
                () => {
                    xrSession = null;
                    isDragging = false;
                    activeInputSource = null;
                    activeBoxIndex = null;
                    selectedBoxIndex = null;
                    isRotating = false;
                    rotationMode = null;
                    rotationInputSource = null;

                    xrButton.textContent =
                        "MR体験を開始";
                }
            );

            xrButton.textContent =
                "MR体験を終了";

            xrSession.requestAnimationFrame(
                onXRFrame
            );

        } catch (error) {
            console.error(error);

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