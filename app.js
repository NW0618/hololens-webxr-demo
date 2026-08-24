const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;
let gl = null;
let xrRefSpace = null;
let program = null;

let meshes = {};
let rayBuffer = null;

let textProgram = null;
let addTextTexture = null;
let deleteTextTexture = null;

let tutorialTitleTexture = null;
let tutorialLine1Texture = null;
let tutorialLine2Texture = null;
let tutorialLine3Texture = null;
let tutorialLine4Texture = null;
let tutorialLine5Texture = null;
let tutorialStartTexture = null;
let finalClearTexture = null;

let textQuadPositionBuffer = null;
let textQuadUvBuffer = null;
let textQuadIndexBuffer = null;

// ==================================================
// 基本設定
// ==================================================

const BOX_HALF = 0.15;

// 主要な表示物の基準距離：ユーザーから約2m先
const DISPLAY_Z = -2.00;

// UI背景の前面から3mmだけ手前に文字・記号を配置する
const DEPTH_EPSILON = 0.003;
const THIN_PANEL_CONTENT_OFFSET = 0.018 + DEPTH_EPSILON;
const BUTTON_CONTENT_OFFSET = 0.025 + DEPTH_EPSILON;
const TUTORIAL_CONTENT_OFFSET = 0.030 + DEPTH_EPSILON;

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
// ランダム問題設定
// 練習1問 + 本番5問
// ==================================================

const TASK_COLORS = ["red", "blue", "green"];
const TASK_SHAPES = ["cube", "sphere", "tetra"];
const TASK_COUNTS = [1, 2];

const COLOR_LABELS = {
    red: "赤",
    blue: "青",
    green: "緑"
};

const SHAPE_LABELS = {
    cube: "立方体",
    sphere: "球体",
    tetra: "三角錐"
};

// ゴール枠は問題色と切り離して固定色にする
const GOAL_NORMAL_COLOR = [0.70, 0.35, 1.00, 1.0];
const GOAL_CLEAR_COLOR = [1.00, 0.72, 0.10, 1.0];

const PRACTICE_TASK = {
    colorName: "blue",
    shape: "sphere",
    requiredCount: 1
};

let taskSequence = [];
let currentQuestionIndex = 0; // 0=練習, 1～5=本番
let currentTask = PRACTICE_TASK;

let gameCleared = false;
let correctCount = 0;

let countdownActive = false;
let countdownStartTime = 0;

let timerRunning = false;
let timedStartTime = 0;
let currentElapsedMs = 0;
let finalElapsedMs = 0;

let finishedAll = false;
let finishEffectStartTime = 0;

// MR開始時に1回だけ表示する操作チュートリアル
let tutorialActive = true;
let tutorialCompleted = false;

const TUTORIAL_PANEL_CENTER = [-0.05, 0.05, DISPLAY_Z];
const TUTORIAL_START_CENTER = [-0.05, -0.54, DISPLAY_Z];
const TUTORIAL_START_HALF = 0.18;

// 本番1～4問目の自動遷移
let autoAdvancePending = false;
let autoAdvanceStartTime = 0;
const AUTO_ADVANCE_DELAY_MS = 800;

const TOTAL_TIMED_QUESTIONS = 5;
const COUNTDOWN_MS = 3000;

const NEXT_TASK_CENTER = [-0.05, 0.0, DISPLAY_Z];
const NEXT_TASK_HALF = 0.14;

const TIMER_PANEL_CENTER = [-0.05, 0.96, DISPLAY_Z];
const PROGRESS_PANEL_CENTER = [-0.62, 0.96, DISPLAY_Z];

// 最終結果表示：目線の高さ
const FINAL_CLEAR_CENTER = [-0.05, 0.28, DISPLAY_Z];
const FINAL_TIME_CENTER = [-0.05, 0.02, DISPLAY_Z];

// ==================================================
// 初期オブジェクト：1個だけ（約2m先）
// ==================================================

let boxes = [
    {
        center: [-0.05, 0.0, DISPLAY_Z],
        shape: "cube",
        colorName: "blue",
        color: COLORS.blue,
        scale: 1.0,
        rotationX: 0,
        rotationY: 0
    }
];

let selectedBoxIndex = null;
let previousGoalObjectCount = 0;

// ==================================================
// ゴール
// 左側・約2m先。2個を並べて入れやすい大きさは維持
// ==================================================

const GOAL_CENTER = [-1.12, -0.02, DISPLAY_Z];
const GOAL_HALF = 0.50;
const GOAL_DEPTH_TOLERANCE = 0.75;

// ==================================================
// 問題表示パネル（MR空間内）
// 画面上部から右下側へ移動
// ==================================================

const TASK_PANEL_CENTER = [0.02, -0.62, DISPLAY_Z];

// ==================================================
// オブジェクト追加ボタン：右下側
// 追加されたオブジェクトと重ならない位置
// ==================================================

const ADD_CENTER = [0.72, -0.66, DISPLAY_Z];
const ADD_HALF = 0.20;

// 「追加」の右側に独立した削除ボタン
const DELETE_CENTER = [1.32, -0.66, DISPLAY_Z];
const DELETE_HALF = 0.20;

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
// Canvas文字テクスチャ用シェーダー
// ==================================================

const textVertexShaderSource = `
attribute vec3 aPosition;
attribute vec2 aTexCoord;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;

varying vec2 vTexCoord;

void main() {
    vTexCoord = aTexCoord;

    gl_Position =
        uProjectionMatrix *
        uViewMatrix *
        uModelMatrix *
        vec4(aPosition, 1.0);
}
`;

const textFragmentShaderSource = `
precision mediump float;

uniform sampler2D uTexture;
varying vec2 vTexCoord;

void main() {
    vec4 texColor =
        texture2D(
            uTexture,
            vTexCoord
        );

    if (texColor.a < 0.05) {
        discard;
    }

    gl_FragColor = texColor;
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

function createTextProgram() {
    const vertexShader =
        createShader(
            gl.VERTEX_SHADER,
            textVertexShaderSource
        );

    const fragmentShader =
        createShader(
            gl.FRAGMENT_SHADER,
            textFragmentShaderSource
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

    gl.linkProgram(
        shaderProgram
    );

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


// ==================================================
// Canvasで日本語をテクスチャ化
// ==================================================

function createJapaneseTextTexture(
    textValue,
    options = {}
) {
    const width =
        options.width || 512;

    const height =
        options.height || 256;

    const fontSize =
        options.fontSize || 128;

    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width = width;
    canvas.height = height;

    const ctx =
        canvas.getContext(
            "2d"
        );

    if (!ctx) {
        throw new Error(
            "Canvas 2D contextを作成できませんでした。"
        );
    }

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    ctx.textAlign =
        options.textAlign ||
        "center";

    ctx.textBaseline =
        "middle";

    ctx.font =
        "700 " +
        fontSize +
        "px 'Yu Gothic UI', 'Yu Gothic', 'Meiryo', sans-serif";

    ctx.fillStyle =
        options.color ||
        "#ffffff";

    const textX =
        ctx.textAlign === "left"
            ? (
                options.paddingX ||
                64
            )
            : width / 2;

    ctx.fillText(
        textValue,
        textX,
        height / 2
    );

    const texture =
        gl.createTexture();

    gl.bindTexture(
        gl.TEXTURE_2D,
        texture
    );

    gl.pixelStorei(
        gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
        true
    );

    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas
    );

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR
    );

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        gl.LINEAR
    );

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE
    );

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE
    );

    gl.bindTexture(
        gl.TEXTURE_2D,
        null
    );

    return texture;
}

function createTextQuadGeometry() {
    const positions =
        new Float32Array([
            -1, -1, 0,
             1, -1, 0,
             1,  1, 0,
            -1,  1, 0
        ]);

    const uvs =
        new Float32Array([
            0, 1,
            1, 1,
            1, 0,
            0, 0
        ]);

    const indices =
        new Uint16Array([
            0, 1, 2,
            0, 2, 3
        ]);

    textQuadPositionBuffer =
        gl.createBuffer();

    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        textQuadPositionBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        positions,
        gl.STATIC_DRAW
    );

    textQuadUvBuffer =
        gl.createBuffer();

    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        textQuadUvBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        uvs,
        gl.STATIC_DRAW
    );

    textQuadIndexBuffer =
        gl.createBuffer();

    gl.bindBuffer(
        gl.ELEMENT_ARRAY_BUFFER,
        textQuadIndexBuffer
    );

    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        indices,
        gl.STATIC_DRAW
    );
}

function drawTexturedQuad(
    view,
    center,
    halfWidth,
    halfHeight,
    texture
) {
    if (
        !texture ||
        !textProgram
    ) {
        return;
    }

    gl.useProgram(
        textProgram
    );

    const positionLocation =
        gl.getAttribLocation(
            textProgram,
            "aPosition"
        );

    const texCoordLocation =
        gl.getAttribLocation(
            textProgram,
            "aTexCoord"
        );

    const projectionLocation =
        gl.getUniformLocation(
            textProgram,
            "uProjectionMatrix"
        );

    const viewLocation =
        gl.getUniformLocation(
            textProgram,
            "uViewMatrix"
        );

    const modelLocation =
        gl.getUniformLocation(
            textProgram,
            "uModelMatrix"
        );

    const textureLocation =
        gl.getUniformLocation(
            textProgram,
            "uTexture"
        );

    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        textQuadPositionBuffer
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
        gl.ARRAY_BUFFER,
        textQuadUvBuffer
    );

    gl.enableVertexAttribArray(
        texCoordLocation
    );

    gl.vertexAttribPointer(
        texCoordLocation,
        2,
        gl.FLOAT,
        false,
        0,
        0
    );

    gl.bindBuffer(
        gl.ELEMENT_ARRAY_BUFFER,
        textQuadIndexBuffer
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
        shapeMatrix(
            center,
            halfWidth,
            halfHeight,
            1.0
        )
    );

    gl.activeTexture(
        gl.TEXTURE0
    );

    gl.bindTexture(
        gl.TEXTURE_2D,
        texture
    );

    gl.uniform1i(
        textureLocation,
        0
    );

    gl.enable(
        gl.BLEND
    );

    gl.blendFunc(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA
    );

    gl.drawElements(
        gl.TRIANGLES,
        6,
        gl.UNSIGNED_SHORT,
        0
    );

    gl.disable(
        gl.BLEND
    );

    gl.bindTexture(
        gl.TEXTURE_2D,
        null
    );
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
    // 調整パネルも常に約2m先へ固定する
    const panelZ = DISPLAY_Z;

    const sizeY = panelY + 0.30;
    const rotateY = panelY + 0.10;
    const colorY = panelY - 0.10;
    const shapeY = panelY - 0.30;

    return {
        center: [panelX, panelY, panelZ],

        sizeMinus: [panelX - 0.13, sizeY, panelZ + THIN_PANEL_CONTENT_OFFSET],
        sizePlus: [panelX + 0.13, sizeY, panelZ + THIN_PANEL_CONTENT_OFFSET],

        rotateVertical: [panelX - 0.13, rotateY, panelZ + THIN_PANEL_CONTENT_OFFSET],
        rotateHorizontal: [panelX + 0.13, rotateY, panelZ + THIN_PANEL_CONTENT_OFFSET],

        red: [panelX - 0.17, colorY, panelZ + THIN_PANEL_CONTENT_OFFSET],
        blue: [panelX, colorY, panelZ + THIN_PANEL_CONTENT_OFFSET],
        green: [panelX + 0.17, colorY, panelZ + THIN_PANEL_CONTENT_OFFSET],

        cube: [panelX - 0.17, shapeY, panelZ + THIN_PANEL_CONTENT_OFFSET],
        sphere: [panelX, shapeY, panelZ + THIN_PANEL_CONTENT_OFFSET],
        tetra: [panelX + 0.17, shapeY, panelZ + THIN_PANEL_CONTENT_OFFSET],

        // 削除ボタン：操作パネル右上
        deleteButton: [panelX + 0.24, panelY + 0.50, panelZ + 0.051]
    };
}

// ==================================================
// 操作対象検索
// ==================================================

function findNearestTarget(origin, direction) {
    let result = null;

    if (
        countdownActive ||
        finishedAll ||
        autoAdvancePending
    ) {
        return null;
    }

    if (tutorialActive) {
        const tutorialDistance =
            rayBoxDistance(
                origin,
                direction,
                TUTORIAL_START_CENTER,
                TUTORIAL_START_HALF
            );

        if (tutorialDistance !== null) {
            return {
                type: "tutorialStart",
                distance: tutorialDistance
            };
        }

        return null;
    }

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

    // 独立した「削除」ボタン
    const deleteDistance = rayBoxDistance(
        origin,
        direction,
        DELETE_CENTER,
        DELETE_HALF
    );

    if (
        deleteDistance !== null &&
        selectedBoxIndex !== null &&
        boxes[selectedBoxIndex] &&
        !isLockedCorrectObject(
            boxes[selectedBoxIndex]
        )
    ) {
        if (
            result === null ||
            deleteDistance < result.distance
        ) {
            result = {
                type: "deleteObject",
                distance: deleteDistance
            };
        }
    }

    if (
        gameCleared &&
        currentQuestionIndex === 0
    ) {
        const nextDistance = rayBoxDistance(
            origin,
            direction,
            NEXT_TASK_CENTER,
            NEXT_TASK_HALF
        );

        if (
            nextDistance !== null &&
            (
                result === null ||
                nextDistance < result.distance
            )
        ) {
            result = {
                type: "nextTask",
                distance: nextDistance
            };
        }
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
            { type: "closePanel", center: panel.deleteButton }
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
        // ゴール内で正解済みのオブジェクトは操作対象にしない
        if (
            isLockedCorrectObject(
                boxes[i]
            )
        ) {
            continue;
        }

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

function isLockedCorrectObject(box) {
    return (
        box &&
        box.colorName === currentTask.colorName &&
        box.shape === currentTask.shape &&
        isInsideGoal(box)
    );
}

function updateTaskState() {
    if (
        countdownActive ||
        finishedAll
    ) {
        updateHtmlTaskDisplay();
        return;
    }

    correctCount = 0;

    for (const box of boxes) {
        if (
            box.colorName ===
                currentTask.colorName &&
            box.shape ===
                currentTask.shape &&
            isInsideGoal(box)
        ) {
            correctCount++;
        }
    }

    const wasCleared =
        gameCleared;

    gameCleared =
        correctCount >=
        currentTask.requiredCount;

    const remaining = Math.max(
        0,
        currentTask.requiredCount -
        correctCount
    );

    // ゴール内の正解オブジェクト数が増えたら
    // 選択解除して調整パネルを閉じる
    if (
        correctCount >
        previousGoalObjectCount
    ) {
        selectedBoxIndex = null;

        isDragging = false;
        activeInputSource = null;
        activeBoxIndex = null;
        pressStartCenter = null;

        isRotating = false;
        rotationMode = null;
        rotationInputSource = null;
    }

    previousGoalObjectCount =
        correctCount;

    // 本番最終問題はここで完全終了
    if (
        gameCleared &&
        !wasCleared &&
        currentQuestionIndex ===
            TOTAL_TIMED_QUESTIONS
    ) {
        completeAllQuestions(
            performance.now()
        );
        return;
    }

    // 本番1～4問目は0.8秒後に自動で次へ
    if (
        gameCleared &&
        !wasCleared &&
        currentQuestionIndex > 0 &&
        currentQuestionIndex <
            TOTAL_TIMED_QUESTIONS
    ) {
        autoAdvancePending = true;
        autoAdvanceStartTime =
            performance.now();
    }

    if (gameCleared) {
        status.textContent =
            currentQuestionIndex === 0
                ? "練習CLEAR! 次へ進むと本番開始です。"
                : "CLEAR! 次の問題へ進みます。";
    } else {
        status.textContent =
            getTaskText() +
            " 残り " +
            remaining +
            " 個です。";
    }

    updateHtmlTaskDisplay();
}

// ==================================================
// ゴール描画
// 青い問題なので通常時は青、クリアで緑
// ==================================================

function drawGoal(view) {
    let color =
        gameCleared
            ? GOAL_CLEAR_COLOR
            : GOAL_NORMAL_COLOR;

    if (
        finishedAll &&
        finishEffectStartTime > 0
    ) {
        const pulse =
            0.65 +
            0.35 *
            Math.abs(
                Math.sin(
                    (
                        performance.now() -
                        finishEffectStartTime
                    ) /
                    180
                )
            );

        color = [
            1.0,
            0.55 +
                0.35 * pulse,
            0.08,
            1.0
        ];
    }

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

function drawDigitOne(view, center, color) {
    const h = 0.060;
    const t = 0.010;

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1], center[2]],
            t,
            h,
            0.020
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

function drawSevenSegmentDigit(
    view,
    center,
    digit,
    color,
    scale = 1.0
) {
    const map = {
        "0": ["a", "b", "c", "d", "e", "f"],
        "1": ["b", "c"],
        "2": ["a", "b", "g", "e", "d"],
        "3": ["a", "b", "c", "d", "g"],
        "4": ["f", "g", "b", "c"],
        "5": ["a", "f", "g", "c", "d"],
        "6": ["a", "f", "g", "e", "c", "d"],
        "7": ["a", "b", "c"],
        "8": ["a", "b", "c", "d", "e", "f", "g"],
        "9": ["a", "b", "c", "d", "f", "g"]
    };

    const segments =
        map[String(digit)] || [];

    const w = 0.035 * scale;
    const h = 0.045 * scale;
    const t = 0.006 * scale;
    const z = center[2];

    const defs = {
        a: [center[0], center[1] + h, z, w, t],
        g: [center[0], center[1], z, w, t],
        d: [center[0], center[1] - h, z, w, t],
        f: [center[0] - w, center[1] + h / 2, z, t, h / 2],
        b: [center[0] + w, center[1] + h / 2, z, t, h / 2],
        e: [center[0] - w, center[1] - h / 2, z, t, h / 2],
        c: [center[0] + w, center[1] - h / 2, z, t, h / 2]
    };

    for (const key of segments) {
        const d = defs[key];

        drawShape(
            view,
            shapeMatrix(
                [d[0], d[1], d[2]],
                d[3],
                d[4],
                0.014
            ),
            color
        );
    }
}

function drawSlash(
    view,
    center,
    color,
    scale = 1.0
) {
    drawShape(
        view,
        shapeMatrix(
            center,
            0.045 * scale,
            0.006 * scale,
            0.014,
            Math.PI / 3
        ),
        color
    );
}

function drawDecimalPoint(
    view,
    center,
    color,
    scale = 1.0
) {
    drawShape(
        view,
        shapeMatrix(
            center,
            0.008 * scale,
            0.008 * scale,
            0.014
        ),
        color
    );
}

function drawNumberString(
    view,
    textValue,
    center,
    color,
    scale = 1.0,
    spacing = 0.090
) {
    const chars =
        String(textValue).split("");

    const totalWidth =
        (chars.length - 1) *
        spacing *
        scale;

    let x =
        center[0] -
        totalWidth / 2;

    for (const ch of chars) {
        const pos = [
            x,
            center[1],
            center[2]
        ];

        if (/[0-9]/.test(ch)) {
            drawSevenSegmentDigit(
                view,
                pos,
                ch,
                color,
                scale
            );
        } else if (ch === "/") {
            drawSlash(
                view,
                pos,
                color,
                scale
            );
        } else if (ch === ".") {
            drawDecimalPoint(
                view,
                [
                    x,
                    center[1] - 0.040 * scale,
                    center[2]
                ],
                color,
                scale
            );
        }

        x +=
            spacing *
            scale;
    }
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

function drawNextTaskButton(view) {
    const hover =
        hoverTarget &&
        hoverTarget.type === "nextTask";

    const buttonColor = hover
        ? COLORS.white
        : COLORS.green;

    drawShape(
        view,
        shapeMatrix(
            NEXT_TASK_CENTER,
            0.15,
            0.07,
            0.025
        ),
        [0.08, 0.25, 0.10, 1.0]
    );

    // 「>」を2本の斜線で表現
    drawShape(
        view,
        shapeMatrix(
            [
                NEXT_TASK_CENTER[0] - 0.015,
                NEXT_TASK_CENTER[1] + 0.025,
                NEXT_TASK_CENTER[2] + BUTTON_CONTENT_OFFSET
            ],
            0.050,
            0.010,
            0.018,
            -Math.PI / 4
        ),
        buttonColor
    );

    drawShape(
        view,
        shapeMatrix(
            [
                NEXT_TASK_CENTER[0] - 0.015,
                NEXT_TASK_CENTER[1] - 0.025,
                NEXT_TASK_CENTER[2] + BUTTON_CONTENT_OFFSET
            ],
            0.050,
            0.010,
            0.018,
            Math.PI / 4
        ),
        buttonColor
    );
}

function drawTaskPanel(view) {
    if (finishedAll) {
        return;
    }

    const panelColor =
        gameCleared
            ? [0.20, 0.12, 0.02, 1.0]
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
                TASK_PANEL_CENTER[0] - 0.08,
                TASK_PANEL_CENTER[1],
                TASK_PANEL_CENTER[2] + THIN_PANEL_CONTENT_OFFSET
            ],
            GOAL_CLEAR_COLOR
        );

        if (
            currentQuestionIndex === 0
        ) {
            drawNextTaskButton(view);
        }

        return;
    }

    drawMesh(
        view,
        meshes[currentTask.shape],
        modelMatrix(
            [
                TASK_PANEL_CENTER[0] - 0.15,
                TASK_PANEL_CENTER[1],
                TASK_PANEL_CENTER[2] + THIN_PANEL_CONTENT_OFFSET
            ],
            0.060,
            -0.20,
            0.30
        ),
        COLORS[currentTask.colorName]
    );

    drawXMark(
        view,
        [
            TASK_PANEL_CENTER[0] + 0.015,
            TASK_PANEL_CENTER[1],
            TASK_PANEL_CENTER[2] + THIN_PANEL_CONTENT_OFFSET
        ],
        COLORS.white
    );

    drawSevenSegmentDigit(
        view,
        [
            TASK_PANEL_CENTER[0] + 0.16,
            TASK_PANEL_CENTER[1],
            TASK_PANEL_CENTER[2] + THIN_PANEL_CONTENT_OFFSET
        ],
        currentTask.requiredCount,
        COLORS.white,
        1.0
    );
}

// ==================================================
// ＋ / －
// ==================================================

function drawProgressPanel(view) {
    if (
        currentQuestionIndex === 0 ||
        countdownActive ||
        finishedAll
    ) {
        return;
    }

    drawShape(
        view,
        shapeMatrix(
            PROGRESS_PANEL_CENTER,
            0.17,
            0.08,
            0.018
        ),
        COLORS.panel
    );

    drawNumberString(
        view,
        currentQuestionIndex +
        "/" +
        TOTAL_TIMED_QUESTIONS,
        [
            PROGRESS_PANEL_CENTER[0],
            PROGRESS_PANEL_CENTER[1],
            PROGRESS_PANEL_CENTER[2] + THIN_PANEL_CONTENT_OFFSET
        ],
        COLORS.white,
        0.85,
        0.080
    );
}

function drawTimerPanel(view) {
    if (
        finishedAll ||
        (
            currentQuestionIndex === 0 &&
            !countdownActive
        )
    ) {
        return;
    }

    const elapsedMs =
        getDisplayedElapsedMs();

    const timeText =
        formatTimeSeconds(
            elapsedMs
        );

    drawShape(
        view,
        shapeMatrix(
            TIMER_PANEL_CENTER,
            0.23,
            0.08,
            0.018
        ),
        COLORS.panel
    );

    drawNumberString(
        view,
        timeText,
        [
            TIMER_PANEL_CENTER[0],
            TIMER_PANEL_CENTER[1],
            TIMER_PANEL_CENTER[2] + THIN_PANEL_CONTENT_OFFSET
        ],
        COLORS.white,
        0.70,
        0.073
    );
}

function drawCountdown(view, now) {
    if (!countdownActive) {
        return;
    }

    const elapsed =
        now -
        countdownStartTime;

    const remaining =
        Math.max(
            0,
            COUNTDOWN_MS -
            elapsed
        );

    const number =
        Math.max(
            1,
            Math.ceil(
                remaining /
                1000
            )
        );

    drawShape(
        view,
        shapeMatrix(
            [0.0, 0.12, DISPLAY_Z],
            0.18,
            0.18,
            0.025
        ),
        [0.12, 0.06, 0.20, 0.92]
    );

    drawSevenSegmentDigit(
        view,
        [0.0, 0.12, DISPLAY_Z + BUTTON_CONTENT_OFFSET],
        number,
        COLORS.white,
        2.2
    );
}

function drawFinishEffect(view, now) {
    if (!finishedAll) {
        return;
    }

    const elapsed =
        now -
        finishEffectStartTime;

    const effectDuration =
        3200;

    if (
        elapsed <=
        effectDuration
    ) {
        const t =
            elapsed /
            effectDuration;

        for (
            let i = 0;
            i < 18;
            i++
        ) {
            const angle =
                (
                    Math.PI * 2 *
                    i /
                    18
                ) +
                elapsed /
                450;

            const radius =
                0.18 +
                0.85 * t;

            const yWave =
                Math.sin(
                    angle * 2 +
                    elapsed /
                    250
                ) *
                0.18;

            drawShape(
                view,
                shapeMatrix(
                    [
                        Math.cos(angle) *
                            radius,
                        0.18 +
                            yWave,
                        DISPLAY_Z +
                            Math.sin(angle) *
                            0.03
                    ],
                    0.025,
                    0.025,
                    0.025,
                    angle
                ),
                GOAL_CLEAR_COLOR
            );
        }
    }

    // 目線の高さに「クリア」
    drawTexturedQuad(
        view,
        FINAL_CLEAR_CENTER,
        0.28,
        0.085,
        finalClearTexture
    );

    // その下に最終タイム
    const timeText =
        formatTimeSeconds(
            finalElapsedMs
        );

    drawNumberString(
        view,
        timeText,
        FINAL_TIME_CENTER,
        GOAL_CLEAR_COLOR,
        1.15,
        0.090
    );
}

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
    const isHover =
        hoverTarget &&
        hoverTarget.type === "closePanel";

    const backgroundColor =
        isHover
            ? [0.40, 0.40, 0.44, 1.0]
            : [0.20, 0.20, 0.24, 1.0];

    drawShape(
        view,
        shapeMatrix(
            center,
            0.080,
            0.080,
            0.030
        ),
        backgroundColor
    );

    const z =
        center[2] + 0.040;

    const xColor =
        isHover
            ? COLORS.white
            : COLORS.gray;

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1], z],
            0.065,
            0.012,
            0.012,
            Math.PI / 4
        ),
        xColor
    );

    drawShape(
        view,
        shapeMatrix(
            [center[0], center[1], z],
            0.065,
            0.012,
            0.012,
            -Math.PI / 4
        ),
        xColor
    );
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

    // 右上の×は操作パネルを閉じるボタン
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



function drawTutorialPanel(view) {
    if (!tutorialActive) {
        return;
    }

    drawShape(
        view,
        shapeMatrix(
            TUTORIAL_PANEL_CENTER,
            0.72,
            0.56,
            0.030
        ),
        [0.06, 0.06, 0.08, 0.96]
    );

    drawTexturedQuad(
        view,
        [
            TUTORIAL_PANEL_CENTER[0],
            TUTORIAL_PANEL_CENTER[1] + 0.43,
            TUTORIAL_PANEL_CENTER[2] + TUTORIAL_CONTENT_OFFSET
        ],
        0.36,
        0.052,
        tutorialTitleTexture
    );

    // 1～5は同じ文字サイズ・同じ表示幅・等間隔で左揃え
    const ys = [
        0.27,
        0.14,
        0.01,
        -0.12,
        -0.25
    ];

    const textures = [
        tutorialLine1Texture,
        tutorialLine2Texture,
        tutorialLine3Texture,
        tutorialLine4Texture,
        tutorialLine5Texture
    ];

    const tutorialLineHalfWidth =
        0.64;

    const tutorialLineHalfHeight =
        0.046;

    for (let i = 0; i < 5; i++) {
        drawTexturedQuad(
            view,
            [
                TUTORIAL_PANEL_CENTER[0],
                TUTORIAL_PANEL_CENTER[1] + ys[i],
                TUTORIAL_PANEL_CENTER[2] + TUTORIAL_CONTENT_OFFSET
            ],
            tutorialLineHalfWidth,
            tutorialLineHalfHeight,
            textures[i]
        );
    }

    const isHover =
        hoverTarget &&
        hoverTarget.type === "tutorialStart";

    const buttonColor =
        isHover
            ? [0.20, 0.42, 0.25, 1.0]
            : [0.08, 0.28, 0.12, 1.0];

    const frameColor =
        isHover
            ? COLORS.white
            : COLORS.green;

    drawShape(
        view,
        shapeMatrix(
            TUTORIAL_START_CENTER,
            0.28,
            0.10,
            0.025
        ),
        buttonColor
    );

    drawFrame(
        view,
        TUTORIAL_START_CENTER,
        0.11,
        frameColor,
        0.030
    );

    drawTexturedQuad(
        view,
        [
            TUTORIAL_START_CENTER[0],
            TUTORIAL_START_CENTER[1],
            TUTORIAL_START_CENTER[2] + BUTTON_CONTENT_OFFSET
        ],
        0.18,
        0.052,
        tutorialStartTexture
    );
}

function drawAddButton(view) {
    const isHover =
        hoverTarget &&
        hoverTarget.type === "add";

    const backgroundColor =
        isHover
            ? [0.24, 0.30, 0.26, 1.0]
            : [0.10, 0.16, 0.12, 1.0];

    const frameColor =
        isHover
            ? COLORS.white
            : COLORS.green;

    drawShape(
        view,
        shapeMatrix(
            ADD_CENTER,
            0.20,
            0.11,
            0.025
        ),
        backgroundColor
    );

    drawFrame(
        view,
        ADD_CENTER,
        0.115,
        frameColor,
        0.030
    );

    drawTexturedQuad(
        view,
        [
            ADD_CENTER[0],
            ADD_CENTER[1],
            ADD_CENTER[2] + BUTTON_CONTENT_OFFSET
        ],
        0.145,
        0.060,
        addTextTexture
    );
}

// ==================================================
// レイ
// ==================================================


// ==================================================
// 独立した「削除」ボタン
// 選択中オブジェクトがある時だけ有効
// ==================================================

function drawStandaloneDeleteButton(view) {
    const hasSelection =
        selectedBoxIndex !== null &&
        boxes[selectedBoxIndex] &&
        !isLockedCorrectObject(
            boxes[selectedBoxIndex]
        );

    const isHover =
        hasSelection &&
        hoverTarget &&
        hoverTarget.type === "deleteObject";

    const backgroundColor =
        !hasSelection
            ? [0.10, 0.10, 0.10, 0.55]
            : isHover
                ? [0.50, 0.12, 0.12, 1.0]
                : [0.26, 0.06, 0.06, 1.0];

    const frameColor =
        !hasSelection
            ? COLORS.gray
            : isHover
                ? COLORS.white
                : COLORS.red;

    drawShape(
        view,
        shapeMatrix(
            DELETE_CENTER,
            0.20,
            0.11,
            0.025
        ),
        backgroundColor
    );

    drawFrame(
        view,
        DELETE_CENTER,
        0.115,
        frameColor,
        0.030
    );

    if (deleteTextTexture) {
        drawTexturedQuad(
            view,
            [
                DELETE_CENTER[0],
                DELETE_CENTER[1],
                DELETE_CENTER[2] + BUTTON_CONTENT_OFFSET
            ],
            0.145,
            0.060,
            deleteTextTexture
        );
    }
}

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

function getTaskKey(task) {
    return (
        task.colorName +
        "-" +
        task.shape +
        "-" +
        task.requiredCount
    );
}

function getTaskText() {
    const prefix =
        currentQuestionIndex === 0
            ? "練習："
            : "本番 " +
              currentQuestionIndex +
              "/" +
              TOTAL_TIMED_QUESTIONS +
              "：";

    return (
        prefix +
        COLOR_LABELS[currentTask.colorName] +
        "の" +
        SHAPE_LABELS[currentTask.shape] +
        "を" +
        currentTask.requiredCount +
        "個、枠の中へ入れてください。"
    );
}

function createRandomTask(excludedKeys = new Set()) {
    let task = null;

    for (let attempt = 0; attempt < 50; attempt++) {
        task = {
            colorName:
                TASK_COLORS[
                    Math.floor(
                        Math.random() *
                        TASK_COLORS.length
                    )
                ],

            shape:
                TASK_SHAPES[
                    Math.floor(
                        Math.random() *
                        TASK_SHAPES.length
                    )
                ],

            requiredCount:
                TASK_COUNTS[
                    Math.floor(
                        Math.random() *
                        TASK_COUNTS.length
                    )
                ]
        };

        if (
            !excludedKeys.has(
                getTaskKey(task)
            )
        ) {
            break;
        }
    }

    return task;
}

function buildTaskSequence() {
    const sequence = [
        PRACTICE_TASK
    ];

    const usedKeys = new Set([
        getTaskKey(PRACTICE_TASK)
    ]);

    for (
        let i = 0;
        i < TOTAL_TIMED_QUESTIONS;
        i++
    ) {
        const task =
            createRandomTask(
                usedKeys
            );

        sequence.push(task);
        usedKeys.add(
            getTaskKey(task)
        );
    }

    return sequence;
}

function resetObjectsForTask() {
    boxes = [
        {
            center: [-0.05, 0.0, DISPLAY_Z],
            shape: "cube",
            colorName: "blue",
            color: COLORS.blue,
            scale: 1.0,
            rotationX: 0,
            rotationY: 0
        }
    ];

    selectedBoxIndex = null;
    previousGoalObjectCount = 0;

    autoAdvancePending = false;
    autoAdvanceStartTime = 0;

    isDragging = false;
    activeInputSource = null;
    activeBoxIndex = null;
    pressStartCenter = null;

    isRotating = false;
    rotationMode = null;
    rotationInputSource = null;
}

function ensureHtmlTaskDisplay() {
    let taskBox =
        document.getElementById(
            "taskDisplay"
        );

    if (!taskBox) {
        taskBox =
            document.createElement(
                "div"
            );

        taskBox.id =
            "taskDisplay";

        taskBox.style.maxWidth =
            "760px";

        taskBox.style.margin =
            "0 auto 24px auto";

        taskBox.style.padding =
            "18px 22px";

        taskBox.style.border =
            "2px solid #4b5563";

        taskBox.style.borderRadius =
            "12px";

        taskBox.style.fontSize =
            "24px";

        taskBox.style.fontWeight =
            "700";

        taskBox.style.lineHeight =
            "1.5";

        taskBox.style.background =
            "#f3f4f6";

        taskBox.style.color =
            "#111827";

        if (xrButton.parentNode) {
            xrButton.parentNode.insertBefore(
                taskBox,
                xrButton
            );
        }
    }

    return taskBox;
}

function updateHtmlTaskDisplay() {
    const taskBox =
        ensureHtmlTaskDisplay();

    if (!taskBox) {
        return;
    }

    if (finishedAll) {
        taskBox.textContent =
            "COMPLETE! 本番5問の合計タイム：" +
            formatTimeSeconds(
                finalElapsedMs
            ) +
            " 秒";

        taskBox.style.borderColor =
            "#d4a017";

        return;
    }

    if (countdownActive) {
        taskBox.textContent =
            "本番開始までカウントダウン中です。";

        taskBox.style.borderColor =
            "#7c3aed";

        return;
    }

    if (gameCleared) {
        taskBox.textContent =
            currentQuestionIndex === 0
                ? "練習クリア！ 次へ進むと3秒カウントダウン後に本番開始です。"
                : "CLEAR! 自動で次の問題へ進みます。";

        taskBox.style.borderColor =
            "#d4a017";

        return;
    }

    taskBox.textContent =
        getTaskText();

    taskBox.style.borderColor =
        "#7c3aed";
}

function startNewTask() {
    if (finishedAll) {
        return;
    }

    if (
        currentQuestionIndex === 0
    ) {
        currentQuestionIndex = 1;
        currentTask =
            taskSequence[
                currentQuestionIndex
            ];

        gameCleared = false;
        correctCount = 0;

        resetObjectsForTask();

        countdownActive = true;
        countdownStartTime =
            performance.now();

        autoAdvancePending = false;
        autoAdvanceStartTime = 0;

        timerRunning = false;
        timedStartTime = 0;
        currentElapsedMs = 0;

        status.textContent =
            "3秒後に本番を開始します。";

        updateHtmlTaskDisplay();
        return;
    }

    if (
        currentQuestionIndex <
        TOTAL_TIMED_QUESTIONS
    ) {
        currentQuestionIndex++;

        currentTask =
            taskSequence[
                currentQuestionIndex
            ];

        gameCleared = false;
        correctCount = 0;

        resetObjectsForTask();
        updateTaskState();
    }
}

function formatTimeSeconds(ms) {
    return (
        ms / 1000
    ).toFixed(1);
}

function getDisplayedElapsedMs() {
    if (finishedAll) {
        return finalElapsedMs;
    }

    if (
        timerRunning &&
        timedStartTime > 0
    ) {
        return (
            performance.now() -
            timedStartTime
        );
    }

    return currentElapsedMs;
}

function updateCountdownState(now) {
    if (!countdownActive) {
        return;
    }

    const elapsed =
        now -
        countdownStartTime;

    if (
        elapsed >=
        COUNTDOWN_MS
    ) {
        countdownActive = false;
        timerRunning = true;
        timedStartTime = now;
        currentElapsedMs = 0;

        status.textContent =
            getTaskText();

        updateHtmlTaskDisplay();
    }
}

function completeAllQuestions(now) {
    timerRunning = false;

    finalElapsedMs =
        timedStartTime > 0
            ? now - timedStartTime
            : currentElapsedMs;

    currentElapsedMs =
        finalElapsedMs;

    finishedAll = true;
    finishEffectStartTime = now;
    gameCleared = true;

    selectedBoxIndex = null;
    isDragging = false;
    activeInputSource = null;
    activeBoxIndex = null;
    isRotating = false;
    rotationMode = null;
    rotationInputSource = null;

    status.textContent =
        "COMPLETE! 本番5問 合計 " +
        formatTimeSeconds(
            finalElapsedMs
        ) +
        " 秒";

    updateHtmlTaskDisplay();
}


function advanceTimedQuestionImmediately() {
    if (
        finishedAll ||
        currentQuestionIndex <= 0 ||
        currentQuestionIndex >=
            TOTAL_TIMED_QUESTIONS
    ) {
        return;
    }

    currentQuestionIndex++;

    currentTask =
        taskSequence[
            currentQuestionIndex
        ];

    gameCleared = false;
    correctCount = 0;

    autoAdvancePending = false;
    autoAdvanceStartTime = 0;

    resetObjectsForTask();
    updateTaskState();
}

function deleteSelectedObject() {
    if (
        selectedBoxIndex === null ||
        !boxes[selectedBoxIndex] ||
        isLockedCorrectObject(
            boxes[selectedBoxIndex]
        )
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
// 下側UIと重ならないよう中央より少し右上へ生成
// ==================================================

function addNewObject() {
    // 追加したオブジェクトも同じ約2m面に並べる。
    // 重なりを避けるため、奥行きではなくX/Y方向へ配置する。
    const spawnIndex = Math.max(
        0,
        boxes.length - 1
    );

    const spawnColumn =
        spawnIndex % 2;

    const spawnRow =
        Math.floor(
            spawnIndex / 2
        );

    boxes.push({
        center: [
            0.08 +
                spawnColumn * 0.38,
            0.24 -
                spawnRow * 0.34,
            DISPLAY_Z
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

    const now =
        performance.now();

    updateCountdownState(
        now
    );

    if (
        autoAdvancePending &&
        !finishedAll &&
        now -
            autoAdvanceStartTime >=
            AUTO_ADVANCE_DELAY_MS
    ) {
        advanceTimedQuestionImmediately();
    }

    if (
        timerRunning &&
        timedStartTime > 0
    ) {
        currentElapsedMs =
            now -
            timedStartTime;
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

        if (tutorialActive) {
            drawTutorialPanel(view);
        } else {
            drawGoal(view);
            drawObjects(view);

            if (!finishedAll) {
                drawAddButton(view);
                drawStandaloneDeleteButton(view);
            }

            drawTaskPanel(view);
            drawProgressPanel(view);
            drawTimerPanel(view);
            drawCountdown(view, now);
            drawFinishEffect(view, now);
            drawControlPanel(view);
        }

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

            tutorialActive = true;
            tutorialCompleted = false;

            program = createProgram();
            textProgram = createTextProgram();

            createGeometry();
            createTextQuadGeometry();

            addTextTexture =
                createJapaneseTextTexture(
                    "追加",
                    {
                        width: 512,
                        height: 256,
                        fontSize: 128,
                        color: "#ffffff"
                    }
                );

            deleteTextTexture =
                createJapaneseTextTexture(
                    "削除",
                    {
                        width: 512,
                        height: 256,
                        fontSize: 128,
                        color: "#ffffff"
                    }
                );

            tutorialTitleTexture =
                createJapaneseTextTexture(
                    "操作チュートリアル",
                    {
                        width: 1024,
                        height: 256,
                        fontSize: 88,
                        color: "#ffffff"
                    }
                );

            tutorialLine1Texture =
                createJapaneseTextTexture(
                    "1. 手を前に出し、光線を図形に合わせる",
                    {
                        width: 1536,
                        height: 256,
                        fontSize: 64,
                        color: "#ffffff",
                        textAlign: "left",
                        paddingX: 72
                    }
                );

            tutorialLine2Texture =
                createJapaneseTextTexture(
                    "2. 親指と人差し指をつまんで選択・移動",
                    {
                        width: 1536,
                        height: 256,
                        fontSize: 64,
                        color: "#ffffff",
                        textAlign: "left",
                        paddingX: 72
                    }
                );

            tutorialLine3Texture =
                createJapaneseTextTexture(
                    "3. 図形を選ぶと色・形・大きさを変更できます",
                    {
                        width: 1536,
                        height: 256,
                        fontSize: 64,
                        color: "#ffffff",
                        textAlign: "left",
                        paddingX: 72
                    }
                );

            tutorialLine4Texture =
                createJapaneseTextTexture(
                    "4. ×で操作画面を閉じます",
                    {
                        width: 1536,
                        height: 256,
                        fontSize: 64,
                        color: "#ffffff",
                        textAlign: "left",
                        paddingX: 72
                    }
                );

            tutorialLine5Texture =
                createJapaneseTextTexture(
                    "5. 追加・削除は下のボタンから操作します",
                    {
                        width: 1536,
                        height: 256,
                        fontSize: 64,
                        color: "#ffffff",
                        textAlign: "left",
                        paddingX: 72
                    }
                );

            tutorialStartTexture =
                createJapaneseTextTexture(
                    "練習開始",
                    {
                        width: 768,
                        height: 256,
                        fontSize: 92,
                        color: "#ffffff"
                    }
                );

            finalClearTexture =
                createJapaneseTextTexture(
                    "クリア",
                    {
                        width: 1024,
                        height: 256,
                        fontSize: 118,
                        color: "#ffffff"
                    }
                );

            gl.enable(gl.DEPTH_TEST);

            updateTaskState();

            if (tutorialActive) {
                status.textContent =
                    "操作チュートリアルを確認して、練習開始を押してください。";
            }

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

                    if (
                        countdownActive ||
                        finishedAll ||
                        autoAdvancePending
                    ) {
                        return;
                    }

                    const target = findNearestTarget(
                        ray.origin,
                        ray.direction
                    );

                    if (!target) {
                        return;
                    }

                    if (
                        target.type ===
                        "tutorialStart"
                    ) {
                        tutorialActive = false;
                        tutorialCompleted = true;
                        selectedBoxIndex = null;

                        status.textContent =
                            getTaskText();

                        updateHtmlTaskDisplay();
                        return;
                    }

                    if (target.type === "add") {
                        addNewObject();
                        return;
                    }

                    if (target.type === "nextTask") {
                        if (gameCleared) {
                            startNewTask();
                        }

                        return;
                    }

                    if (target.type === "closePanel") {
                        // 調整パネルだけ閉じる。オブジェクトは削除しない。
                        selectedBoxIndex = null;
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

                    updateHtmlTaskDisplay();
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

taskSequence =
    buildTaskSequence();

currentQuestionIndex = 0;
currentTask =
    taskSequence[0];

updateTaskState();
checkXR();