"use strict";

const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;
let xrRefSpace = null;
let gl = null;

let solidProgram = null;
let textureProgram = null;

let cubeMesh = null;
let textMeshes = {};
let textureQuad = null;
let canvasTextures = {};

const SCENE_Z = -2.0;
const PANEL_HALF_WIDTH = 0.34;
const PANEL_HALF_HEIGHT = 0.105;
const PANEL_HALF_DEPTH = 0.015;
const CONTENT_Z = SCENE_Z + PANEL_HALF_DEPTH + 0.003;

const ROWS = [
    { key: "add", y: 0.34 },
    { key: "delete", y: 0.02 },
    { key: "clear", y: -0.30 }
];

const COLORS = {
    white: [1.0, 1.0, 1.0, 1.0],
    canvasPanel: [0.22, 0.04, 0.04, 1.0],
    meshPanel: [0.04, 0.20, 0.07, 1.0],
    blue: [0.15, 0.45, 1.0, 1.0]
};

const solidVertexShaderSource = `
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

const solidFragmentShaderSource = `
precision mediump float;
uniform vec4 uColor;

void main() {
    gl_FragColor = uColor;
}
`;

const textureVertexShaderSource = `
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

const textureFragmentShaderSource = `
precision mediump float;
uniform sampler2D uTexture;
varying vec2 vTexCoord;

void main() {
    vec4 color = texture2D(uTexture, vTexCoord);
    if (color.a < 0.05) {
        discard;
    }
    gl_FragColor = color;
}
`;

function createShader(type, source) {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error("シェーダーを作成できませんでした。");
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "不明なシェーダーエラー";
        gl.deleteShader(shader);
        throw new Error(message);
    }

    return shader;
}

function createProgram(vertexSource, fragmentSource) {
    const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();

    if (!program) {
        throw new Error("WebGLプログラムを作成できませんでした。");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) || "不明なリンクエラー";
        gl.deleteProgram(program);
        throw new Error(message);
    }

    return program;
}

function createIndexedMesh(vertices, indices) {
    const positionBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    if (!positionBuffer || !indexBuffer) {
        throw new Error("メッシュ用バッファを作成できませんでした。");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    return {
        positionBuffer,
        indexBuffer,
        indexCount: indices.length,
        vertexCount: vertices.length / 3,
        indexed: true
    };
}

function createArrayMesh(vertices) {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) {
        throw new Error("文字メッシュ用バッファを作成できませんでした。");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    return {
        positionBuffer,
        vertexCount: vertices.length / 3,
        indexed: false
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

    return createIndexedMesh(vertices, indices);
}

function createTextureQuad() {
    const positions = [
        -1, -1, 0,
         1, -1, 0,
         1,  1, 0,
        -1,  1, 0
    ];

    const uvs = [
        0, 1,
        1, 1,
        1, 0,
        0, 0
    ];

    const indices = [0, 1, 2, 0, 2, 3];

    const positionBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    if (!positionBuffer || !uvBuffer || !indexBuffer) {
        throw new Error("テクスチャ用バッファを作成できませんでした。");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    return { positionBuffer, uvBuffer, indexBuffer, indexCount: indices.length };
}

function createCanvasTextTexture(textValue) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;

    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Canvas 2Dを開始できませんでした。");
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 132px 'Yu Gothic UI', 'Yu Gothic', Meiryo, sans-serif";
    context.fillStyle = "#ffffff";
    context.fillText(textValue, canvas.width / 2, canvas.height / 2);

    const texture = gl.createTexture();
    if (!texture) {
        throw new Error("文字テクスチャを作成できませんでした。");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}

function identityMatrix() {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}

function shapeMatrix(center, scaleX, scaleY, scaleZ) {
    return new Float32Array([
        scaleX, 0, 0, 0,
        0, scaleY, 0, 0,
        0, 0, scaleZ, 0,
        center[0], center[1], center[2], 1
    ]);
}

function drawSolidMesh(view, mesh, matrix, color) {
    gl.useProgram(solidProgram);

    const positionLocation = gl.getAttribLocation(solidProgram, "aPosition");
    const projectionLocation = gl.getUniformLocation(solidProgram, "uProjectionMatrix");
    const viewLocation = gl.getUniformLocation(solidProgram, "uViewMatrix");
    const modelLocation = gl.getUniformLocation(solidProgram, "uModelMatrix");
    const colorLocation = gl.getUniformLocation(solidProgram, "uColor");

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(projectionLocation, false, view.projectionMatrix);
    gl.uniformMatrix4fv(viewLocation, false, view.transform.inverse.matrix);
    gl.uniformMatrix4fv(modelLocation, false, matrix);
    gl.uniform4fv(colorLocation, color);

    if (mesh.indexed) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    } else {
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
    }
}

function drawTexturedQuad(view, center, halfWidth, halfHeight, texture) {
    gl.useProgram(textureProgram);

    const positionLocation = gl.getAttribLocation(textureProgram, "aPosition");
    const uvLocation = gl.getAttribLocation(textureProgram, "aTexCoord");
    const projectionLocation = gl.getUniformLocation(textureProgram, "uProjectionMatrix");
    const viewLocation = gl.getUniformLocation(textureProgram, "uViewMatrix");
    const modelLocation = gl.getUniformLocation(textureProgram, "uModelMatrix");
    const textureLocation = gl.getUniformLocation(textureProgram, "uTexture");

    gl.bindBuffer(gl.ARRAY_BUFFER, textureQuad.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureQuad.uvBuffer);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, textureQuad.indexBuffer);

    gl.uniformMatrix4fv(projectionLocation, false, view.projectionMatrix);
    gl.uniformMatrix4fv(viewLocation, false, view.transform.inverse.matrix);
    gl.uniformMatrix4fv(
        modelLocation,
        false,
        shapeMatrix(center, halfWidth, halfHeight, 1.0)
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(textureLocation, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, textureQuad.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

function drawScene(view) {
    for (const row of ROWS) {
        const leftCenter = [-0.48, row.y, SCENE_Z];
        const rightCenter = [0.48, row.y, SCENE_Z];

        drawSolidMesh(
            view,
            cubeMesh,
            shapeMatrix(leftCenter, PANEL_HALF_WIDTH, PANEL_HALF_HEIGHT, PANEL_HALF_DEPTH),
            COLORS.canvasPanel
        );
        drawSolidMesh(
            view,
            cubeMesh,
            shapeMatrix(rightCenter, PANEL_HALF_WIDTH, PANEL_HALF_HEIGHT, PANEL_HALF_DEPTH),
            COLORS.meshPanel
        );

        drawTexturedQuad(
            view,
            [leftCenter[0], leftCenter[1], CONTENT_Z],
            0.22,
            0.060,
            canvasTextures[row.key]
        );

        drawSolidMesh(
            view,
            textMeshes[row.key],
            shapeMatrix([rightCenter[0], rightCenter[1], CONTENT_Z], 0.105, 0.105, 1.0),
            COLORS.white
        );
    }

    drawSolidMesh(
        view,
        cubeMesh,
        shapeMatrix([0.0, -0.62, SCENE_Z], 0.12, 0.12, 0.12),
        COLORS.blue
    );
}

function initializeSceneResources() {
    solidProgram = createProgram(solidVertexShaderSource, solidFragmentShaderSource);
    textureProgram = createProgram(textureVertexShaderSource, textureFragmentShaderSource);
    cubeMesh = createCubeMesh();
    textureQuad = createTextureQuad();

    if (!window.TEXT_MESHES) {
        throw new Error("text_meshes.jsを読み込めませんでした。");
    }

    for (const key of Object.keys(window.TEXT_MESHES)) {
        textMeshes[key] = createArrayMesh(window.TEXT_MESHES[key].vertices);
        canvasTextures[key] = createCanvasTextTexture(window.TEXT_MESHES[key].label);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
}

function onXRFrame(time, frame) {
    const session = frame.session;
    session.requestAnimationFrame(onXRFrame);

    const pose = frame.getViewerPose(xrRefSpace);
    if (!pose) {
        return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (const view of pose.views) {
        const viewport = session.renderState.baseLayer.getViewport(view);
        gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
        drawScene(view);
    }
}

async function startXR() {
    if (xrSession) {
        await xrSession.end();
        return;
    }

    try {
        xrSession = await navigator.xr.requestSession("immersive-ar");

        const canvas = document.createElement("canvas");
        gl = canvas.getContext("webgl", {
            xrCompatible: true,
            alpha: true,
            antialias: true
        });

        if (!gl) {
            throw new Error("WebGLを開始できませんでした。");
        }

        await gl.makeXRCompatible();

        xrSession.updateRenderState({
            baseLayer: new XRWebGLLayer(xrSession, gl)
        });

        xrRefSpace = await xrSession.requestReferenceSpace("local");
        initializeSceneResources();

        xrSession.addEventListener("end", () => {
            xrSession = null;
            xrRefSpace = null;
            xrButton.textContent = "MR比較テストを開始";
            status.textContent = "テストを終了しました。";
        });

        xrButton.textContent = "MR比較テストを終了";
        status.textContent = "左と右の文字を見比べてください。";
        xrSession.requestAnimationFrame(onXRFrame);
    } catch (error) {
        console.error(error);
        xrSession = null;
        status.textContent = "MR開始エラー: " + error.message;
    }
}

async function checkXR() {
    if (!window.isSecureContext) {
        status.textContent = "WebXRにはHTTPSが必要です。";
        return;
    }

    if (!navigator.xr) {
        xrButton.textContent = "WebXR非対応";
        status.textContent = "このブラウザではWebXRを利用できません。";
        return;
    }

    try {
        const supported = await navigator.xr.isSessionSupported("immersive-ar");
        if (!supported) {
            xrButton.textContent = "AR非対応";
            status.textContent = "immersive-arを利用できません。";
            return;
        }

        xrButton.disabled = false;
        xrButton.textContent = "MR比較テストを開始";
        status.textContent = "HoloLens 2で開始してください。";
    } catch (error) {
        console.error(error);
        status.textContent = "WebXR確認エラー: " + error.message;
    }
}

xrButton.addEventListener("click", startXR);
checkXR();
