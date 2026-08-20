const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;
let gl = null;
let xrRefSpace = null;

let program = null;
let positionBuffer = null;
let indexBuffer = null;

let boxColor = [0.2, 0.6, 1.0, 1.0];

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
        createShader(gl.VERTEX_SHADER, vertexShaderSource);

    const fragmentShader =
        createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    const shaderProgram = gl.createProgram();

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(shaderProgram));
    }

    return shaderProgram;
}

function createCube() {
    const vertices = new Float32Array([
        -0.15, -0.15, -0.15,
         0.15, -0.15, -0.15,
         0.15,  0.15, -0.15,
        -0.15,  0.15, -0.15,

        -0.15, -0.15,  0.15,
         0.15, -0.15,  0.15,
         0.15,  0.15,  0.15,
        -0.15,  0.15,  0.15
    ]);

    const indices = new Uint16Array([
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        3, 2, 6, 3, 6, 7,
        1, 5, 6, 1, 6, 2,
        0, 3, 7, 0, 7, 4
    ]);

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        indices,
        gl.STATIC_DRAW
    );
}

function identityMatrix() {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}

function translationMatrix(x, y, z) {
    const m = identityMatrix();

    m[12] = x;
    m[13] = y;
    m[14] = z;

    return m;
}

function drawCube(view) {
    gl.useProgram(program);

    const positionLocation =
        gl.getAttribLocation(program, "aPosition");

    const projectionLocation =
        gl.getUniformLocation(program, "uProjectionMatrix");

    const viewLocation =
        gl.getUniformLocation(program, "uViewMatrix");

    const modelLocation =
        gl.getUniformLocation(program, "uModelMatrix");

    const colorLocation =
        gl.getUniformLocation(program, "uColor");

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    gl.enableVertexAttribArray(positionLocation);

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
        indexBuffer
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

    const modelMatrix =
        translationMatrix(0, 0, -1.5);

    gl.uniformMatrix4fv(
        modelLocation,
        false,
        modelMatrix
    );

    gl.uniform4fv(
        colorLocation,
        boxColor
    );

    gl.drawElements(
        gl.TRIANGLES,
        36,
        gl.UNSIGNED_SHORT,
        0
    );
}

function onXRFrame(time, frame) {
    const session = frame.session;

    session.requestAnimationFrame(onXRFrame);

    const pose =
        frame.getViewerPose(xrRefSpace);

    if (!pose) {
        return;
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

    for (const view of pose.views) {

        const viewport =
            session.renderState.baseLayer.getViewport(view);

        gl.viewport(
            viewport.x,
            viewport.y,
            viewport.width,
            viewport.height
        );

        drawCube(view);
    }
}

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
                await xrSession.requestReferenceSpace(
                    "local"
                );

            program = createProgram();
            createCube();

            gl.enable(gl.DEPTH_TEST);

            xrSession.addEventListener(
                "select",
                () => {

                    if (boxColor[0] < 0.5) {
                        boxColor =
                            [1.0, 0.2, 0.2, 1.0];
                    } else {
                        boxColor =
                            [0.2, 0.6, 1.0, 1.0];
                    }
                }
            );

            xrSession.addEventListener(
                "end",
                () => {
                    xrSession = null;
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

            status.textContent =
                "MR開始エラー: "
                + error.message;
        }
    }
);

checkXR();