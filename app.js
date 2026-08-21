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
// オブジェクト
//
// shape:
// cube   = 立方体
// sphere = 球体
// tetra  = 三角錐
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
// ==================================================

const GOAL_CENTER = [0, -0.45, -1.5];
const GOAL_HALF = 0.28;

let gameCleared = false;


// ==================================================
// オブジェクト追加アイコン
// 上部中央
// ==================================================

const ADD_CENTER = [0.0, 0.68, -1.25];
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

    if (!gl.getShaderParameter(
        shader,
        gl.COMPILE_STATUS
    )) {
        throw new Error(
            gl.getShaderInfoLog(shader)
        );
    }

    return shader;
}


function createProgram() {
    const vertexShader = createShader(
        gl.VERTEX_SHADER,
        vertexShaderSource
    );

    const fragmentShader = createShader(
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

    gl.linkProgram(
        shaderProgram
    );

    if (!gl.getProgramParameter(
        shaderProgram,
        gl.LINK_STATUS
    )) {
        throw new Error(
            gl.getProgramInfoLog(
                shaderProgram
            )
        );
    }

    return shaderProgram;
}


// ==================================================
// メッシュ作成共通
// ==================================================

function createMesh(
    vertices,
    indices
) {
    const positionBuffer =
        gl.createBuffer();

    gl.bindBuffer(
        gl.ARRAY_BUFFER,
        positionBuffer
    );

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(vertices),
        gl.STATIC_DRAW
    );


    const indexBuffer =
        gl.createBuffer();

    gl.bindBuffer(
        gl.ELEMENT_ARRAY_BUFFER,
        indexBuffer
    );

    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(indices),
        gl.STATIC_DRAW
    );


    return {
        positionBuffer: positionBuffer,
        indexBuffer: indexBuffer,
        count: indices.length
    };
}


// ==================================================
// 立方体
// ==================================================

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
    ];

    return createMesh(
        vertices,
        indices
    );
}


// ==================================================
// 球体
// ==================================================

function createSphereMesh() {
    const vertices = [];
    const indices = [];

    const latitudeSegments = 12;
    const longitudeSegments = 16;

    for (
        let lat = 0;
        lat <= latitudeSegments;
        lat++
    ) {
        const theta =
            lat *
            Math.PI /
            latitudeSegments;

        const sinTheta =
            Math.sin(theta);

        const cosTheta =
            Math.cos(theta);


        for (
            let lon = 0;
            lon <= longitudeSegments;
            lon++
        ) {
            const phi =
                lon *
                Math.PI *
                2 /
                longitudeSegments;

            const sinPhi =
                Math.sin(phi);

            const cosPhi =
                Math.cos(phi);


            const x =
                sinTheta *
                cosPhi;

            const y =
                cosTheta;

            const z =
                sinTheta *
                sinPhi;


            vertices.push(
                x,
                y,
                z
            );
        }
    }


    for (
        let lat = 0;
        lat < latitudeSegments;
        lat++
    ) {
        for (
            let lon = 0;
            lon < longitudeSegments;
            lon++
        ) {
            const first =
                lat *
                (
                    longitudeSegments +
                    1
                ) +
                lon;

            const second =
                first +
                longitudeSegments +
                1;


            indices.push(
                first,
                second,
                first + 1
            );


            indices.push(
                second,
                second + 1,
                first + 1
            );
        }
    }


    return createMesh(
        vertices,
        indices
    );
}


// ==================================================
// 三角錐
// 正四面体
// ==================================================

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

    return createMesh(
        vertices,
        indices
    );
}


// ==================================================
// 全ジオメトリ作成
// ==================================================

function createGeometry() {
    meshes.cube =
        createCubeMesh();

    meshes.sphere =
        createSphereMesh();

    meshes.tetra =
        createTetraMesh();

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


// ==================================================
// X軸・Y軸回転
// ==================================================

function modelMatrix(
    center,
    size,
    rotationX,
    rotationY
) {
    const cx =
        Math.cos(rotationX);

    const sx =
        Math.sin(rotationX);

    const cy =
        Math.cos(rotationY);

    const sy =
        Math.sin(rotationY);


    return new Float32Array([
        cy * size,
        0,
        -sy * size,
        0,

        sy * sx * size,
        cx * size,
        cy * sx * size,
        0,

        sy * cx * size,
        -sx * size,
        cy * cx * size,
        0,

        center[0],
        center[1],
        center[2],
        1
    ]);
}


function objectMatrix(box) {
    const size =
        BOX_HALF *
        box.scale;

    return modelMatrix(
        box.center,
        size,
        box.rotationX,
        box.rotationY
    );
}


function shapeMatrix(
    center,
    sx,
    sy,
    sz,
    rotationZ = 0
) {
    const c =
        Math.cos(rotationZ);

    const s =
        Math.sin(rotationZ);


    return new Float32Array([
         c * sx,
         s * sx,
         0,
         0,

        -s * sy,
         c * sy,
         0,
         0,

         0,
         0,
         sz,
         0,

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
        return [
            0,
            0,
            -1
        ];
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
// 回転角度
// ==================================================

function normalizeAngleDelta(angle) {
    while (angle > Math.PI) {
        angle -=
            Math.PI * 2;
    }

    while (angle < -Math.PI) {
        angle +=
            Math.PI * 2;
    }

    return angle;
}


function getHorizontalRayAngle(
    direction
) {
    return Math.atan2(
        direction[0],
        -direction[2]
    );
}


function getVerticalRayAngle(
    direction
) {
    return Math.atan2(
        direction[1],

        Math.hypot(
            direction[0],
            direction[2]
        )
    );
}


// ==================================================
// レイとAABB
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

    let tmin =
        -Infinity;

    let tmax =
        Infinity;


    for (
        let i = 0;
        i < 3;
        i++
    ) {
        if (
            Math.abs(
                direction[i]
            ) <
            0.000001
        ) {
            if (
                origin[i] <
                min[i] ||

                origin[i] >
                max[i]
            ) {
                return null;
            }
        } else {
            const t1 =
                (
                    min[i] -
                    origin[i]
                ) /
                direction[i];

            const t2 =
                (
                    max[i] -
                    origin[i]
                ) /
                direction[i];

            const near =
                Math.min(
                    t1,
                    t2
                );

            const far =
                Math.max(
                    t1,
                    t2
                );

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

            if (
                tmin >
                tmax
            ) {
                return null;
            }
        }
    }

    if (
        tmax < 0
    ) {
        return null;
    }

    return tmin >= 0
        ? tmin
        : tmax;
}


// ==================================================
// 操作パネル
// 4段構成
// ==================================================

function getPanelLayout() {
    if (
        selectedBoxIndex === null ||
        !boxes[selectedBoxIndex]
    ) {
        return null;
    }

    const box =
        boxes[
            selectedBoxIndex
        ];

    const objectHalf =
        BOX_HALF *
        box.scale;

    const panelX =
        box.center[0] +
        objectHalf +
        0.50;

    const panelY =
        box.center[1];

    const panelZ =
        box.center[2] +
        0.04;


    const sizeY =
        panelY +
        0.30;

    const rotateY =
        panelY +
        0.10;

    const colorY =
        panelY -
        0.10;

    const shapeY =
        panelY -
        0.30;


    return {
        center: [
            panelX,
            panelY,
            panelZ
        ],

        sizeMinus: [
            panelX - 0.13,
            sizeY,
            panelZ + 0.04
        ],

        sizePlus: [
            panelX + 0.13,
            sizeY,
            panelZ + 0.04
        ],

        rotateVertical: [
            panelX - 0.13,
            rotateY,
            panelZ + 0.04
        ],

        rotateHorizontal: [
            panelX + 0.13,
            rotateY,
            panelZ + 0.04
        ],

        red: [
            panelX - 0.17,
            colorY,
            panelZ + 0.04
        ],

        blue: [
            panelX,
            colorY,
            panelZ + 0.04
        ],

        green: [
            panelX + 0.17,
            colorY,
            panelZ + 0.04
        ],

        cube: [
            panelX - 0.17,
            shapeY,
            panelZ + 0.04
        ],

        sphere: [
            panelX,
            shapeY,
            panelZ + 0.04
        ],

        tetra: [
            panelX + 0.17,
            shapeY,
            panelZ + 0.04
        ]
    };
}


// ==================================================
// 操作対象検索
// ==================================================

function findNearestTarget(
    origin,
    direction
) {
    let result = null;


    // オブジェクト追加
    const addDistance =
        rayBoxDistance(
            origin,
            direction,
            ADD_CENTER,
            ADD_HALF
        );

    if (
        addDistance !== null
    ) {
        result = {
            type: "add",
            distance: addDistance
        };
    }


    const panel =
        getPanelLayout();


    if (panel) {
        const controls = [
            {
                type: "sizeMinus",
                center: panel.sizeMinus
            },
            {
                type: "sizePlus",
                center: panel.sizePlus
            },

            {
                type: "rotateVertical",
                center: panel.rotateVertical
            },
            {
                type: "rotateHorizontal",
                center: panel.rotateHorizontal
            },

            {
                type: "colorRed",
                center: panel.red
            },
            {
                type: "colorBlue",
                center: panel.blue
            },
            {
                type: "colorGreen",
                center: panel.green
            },

            {
                type: "shapeCube",
                center: panel.cube
            },
            {
                type: "shapeSphere",
                center: panel.sphere
            },
            {
                type: "shapeTetra",
                center: panel.tetra
            }
        ];


        for (
            const control
            of controls
        ) {
            const distance =
                rayBoxDistance(
                    origin,
                    direction,
                    control.center,
                    0.09
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
                    type:
                        control.type,

                    distance:
                        distance
                };
            }
        }
    }


    // オブジェクト
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
// メッシュ描画
// ==================================================

function drawMesh(
    view,
    mesh,
    matrix,
    color
) {
    gl.useProgram(
        program
    );

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
        mesh.positionBuffer
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
        mesh.indexBuffer
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
        mesh.count,
        gl.UNSIGNED_SHORT,
        0
    );
}


// ==================================================
// UI用立方体
// ==================================================

function drawShape(
    view,
    matrix,
    color
) {
    drawMesh(
        view,
        meshes.cube,
        matrix,
        color
    );
}


// ==================================================
// 平面外枠
// ==================================================

function drawFrame(
    view,
    center,
    half,
    color,
    depthOffset = 0
) {
    const t =
        0.010;

    const z =
        center[2] +
        depthOffset;


    drawShape(
        view,

        shapeMatrix(
            [
                center[0],
                center[1] + half,
                z
            ],
            half,
            t,
            t
        ),

        color
    );


    drawShape(
        view,

        shapeMatrix(
            [
                center[0],
                center[1] - half,
                z
            ],
            half,
            t,
            t
        ),

        color
    );


    drawShape(
        view,

        shapeMatrix(
            [
                center[0] - half,
                center[1],
                z
            ],
            t,
            half,
            t
        ),

        color
    );


    drawShape(
        view,

        shapeMatrix(
            [
                center[0] + half,
                center[1],
                z
            ],
            t,
            half,
            t
        ),

        color
    );
}


// ==================================================
// オブジェクト外枠
// ==================================================

function drawObjectOutline(
    view,
    box,
    color
) {
    const h =
        BOX_HALF *
        box.scale +
        0.025;

    const t =
        0.010;

    const x =
        box.center[0];

    const y =
        box.center[1];

    const z =
        box.center[2];


    for (
        const yy
        of [-h, h]
    ) {
        for (
            const zz
            of [-h, h]
        ) {
            drawShape(
                view,

                shapeMatrix(
                    [
                        x,
                        y + yy,
                        z + zz
                    ],
                    h,
                    t,
                    t
                ),

                color
            );
        }
    }


    for (
        const xx
        of [-h, h]
    ) {
        for (
            const zz
            of [-h, h]
        ) {
            drawShape(
                view,

                shapeMatrix(
                    [
                        x + xx,
                        y,
                        z + zz
                    ],
                    t,
                    h,
                    t
                ),

                color
            );
        }
    }


    for (
        const xx
        of [-h, h]
    ) {
        for (
            const yy
            of [-h, h]
        ) {
            drawShape(
                view,

                shapeMatrix(
                    [
                        x + xx,
                        y + yy,
                        z
                    ],
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
    for (
        let i = 0;
        i < boxes.length;
        i++
    ) {
        const box =
            boxes[i];


        let mesh =
            meshes[
                box.shape
            ];

        if (!mesh) {
            mesh =
                meshes.cube;
        }


        drawMesh(
            view,
            mesh,
            objectMatrix(box),
            box.color
        );


        let outlineColor =
            null;


        if (
            isDragging &&
            activeBoxIndex === i
        ) {
            outlineColor =
                COLORS.green;
        }

        else if (
            isRotating &&
            selectedBoxIndex === i
        ) {
            outlineColor =
                COLORS.green;
        }

        else if (
            selectedBoxIndex === i
        ) {
            outlineColor =
                COLORS.white;
        }

        else if (
            hoverTarget &&
            hoverTarget.type ===
            "box" &&
            hoverTarget.index === i
        ) {
            outlineColor =
                COLORS.gray;
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
// ゴール
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

    const t =
        0.025;


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
// ＋ / －
// ==================================================

function drawPlus(
    view,
    center,
    color
) {
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


function drawMinus(
    view,
    center,
    color
) {
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
    if (
        axis === "vertical"
    ) {
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
                [
                    center[0] - 0.025,
                    center[1] + 0.055,
                    center[2]
                ],
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
                [
                    center[0] + 0.025,
                    center[1] + 0.055,
                    center[2]
                ],
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
                [
                    center[0] - 0.025,
                    center[1] - 0.055,
                    center[2]
                ],
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
                [
                    center[0] + 0.025,
                    center[1] - 0.055,
                    center[2]
                ],
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
                [
                    center[0] - 0.055,
                    center[1] + 0.025,
                    center[2]
                ],
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
                [
                    center[0] - 0.055,
                    center[1] - 0.025,
                    center[2]
                ],
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
                [
                    center[0] + 0.055,
                    center[1] + 0.025,
                    center[2]
                ],
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
                [
                    center[0] + 0.055,
                    center[1] - 0.025,
                    center[2]
                ],
                0.035,
                0.010,
                0.025,
                Math.PI / 4
            ),

            color
        );
    }
}


// ==================================================
// 通常ボタン色
// ==================================================

function normalControlColor(type) {
    if (
        isRotating &&
        (
            (
                type ===
                "rotateVertical" &&
                rotationMode ===
                "vertical"
            ) ||
            (
                type ===
                "rotateHorizontal" &&
                rotationMode ===
                "horizontal"
            )
        )
    ) {
        return COLORS.green;
    }


    if (
        hoverTarget &&
        hoverTarget.type ===
        type
    ) {
        return COLORS.buttonHover;
    }


    return COLORS.white;
}


// ==================================================
// 選択枠
// ==================================================

function drawSelectionFrame(
    view,
    center,
    color
) {
    drawFrame(
        view,
        center,
        0.070,
        color,
        0.012
    );
}


// ==================================================
// 形状アイコン
// ==================================================

function drawShapeIcon(
    view,
    center,
    shape,
    color
) {
    const matrix =
        modelMatrix(
            center,
            0.055,
            -0.25,
            0.35
        );

    drawMesh(
        view,
        meshes[shape],
        matrix,
        color
    );
}


// ==================================================
// 操作パネル
// ==================================================

function drawControlPanel(view) {
    const panel =
        getPanelLayout();

    if (!panel) {
        return;
    }


    // 背景
    drawShape(
        view,

        shapeMatrix(
            panel.center,
            0.32,
            0.47,
            0.018
        ),

        COLORS.panel
    );


    // ==================================================
    // サイズ
    // ==================================================

    drawMinus(
        view,
        panel.sizeMinus,

        normalControlColor(
            "sizeMinus"
        )
    );


    drawPlus(
        view,
        panel.sizePlus,

        normalControlColor(
            "sizePlus"
        )
    );


    // ==================================================
    // 回転
    // ==================================================

    drawRotationHandle(
        view,
        panel.rotateVertical,
        "vertical",

        normalControlColor(
            "rotateVertical"
        )
    );


    drawRotationHandle(
        view,
        panel.rotateHorizontal,
        "horizontal",

        normalControlColor(
            "rotateHorizontal"
        )
    );


    // ==================================================
    // 色
    // 色そのものは固定
    // ==================================================

    drawShape(
        view,

        shapeMatrix(
            panel.red,
            0.055,
            0.055,
            0.025
        ),

        COLORS.red
    );


    drawShape(
        view,

        shapeMatrix(
            panel.blue,
            0.055,
            0.055,
            0.025
        ),

        COLORS.blue
    );


    drawShape(
        view,

        shapeMatrix(
            panel.green,
            0.055,
            0.055,
            0.025
        ),

        COLORS.green
    );


    // ==================================================
    // 形状
    // ==================================================

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


    const box =
        boxes[
            selectedBoxIndex
        ];


    if (!box) {
        return;
    }


    // ==================================================
    // 現在の色：白枠
    // ==================================================

    if (
        box.colorName === "red"
    ) {
        drawSelectionFrame(
            view,
            panel.red,
            COLORS.white
        );
    }


    if (
        box.colorName === "blue"
    ) {
        drawSelectionFrame(
            view,
            panel.blue,
            COLORS.white
        );
    }


    if (
        box.colorName === "green"
    ) {
        drawSelectionFrame(
            view,
            panel.green,
            COLORS.white
        );
    }


    // ==================================================
    // 色ホバー：灰色枠
    // ==================================================

    if (
        hoverTarget &&
        hoverTarget.type ===
        "colorRed"
    ) {
        drawSelectionFrame(
            view,
            panel.red,
            COLORS.gray
        );
    }


    if (
        hoverTarget &&
        hoverTarget.type ===
        "colorBlue"
    ) {
        drawSelectionFrame(
            view,
            panel.blue,
            COLORS.gray
        );
    }


    if (
        hoverTarget &&
        hoverTarget.type ===
        "colorGreen"
    ) {
        drawSelectionFrame(
            view,
            panel.green,
            COLORS.gray
        );
    }


    // ==================================================
    // 現在の形状：白枠
    // ==================================================

    if (
        box.shape === "cube"
    ) {
        drawSelectionFrame(
            view,
            panel.cube,
            COLORS.white
        );
    }


    if (
        box.shape === "sphere"
    ) {
        drawSelectionFrame(
            view,
            panel.sphere,
            COLORS.white
        );
    }


    if (
        box.shape === "tetra"
    ) {
        drawSelectionFrame(
            view,
            panel.tetra,
            COLORS.white
        );
    }


    // ==================================================
    // 形状ホバー：灰色枠
    // ==================================================

    if (
        hoverTarget &&
        hoverTarget.type ===
        "shapeCube"
    ) {
        drawSelectionFrame(
            view,
            panel.cube,
            COLORS.gray
        );
    }


    if (
        hoverTarget &&
        hoverTarget.type ===
        "shapeSphere"
    ) {
        drawSelectionFrame(
            view,
            panel.sphere,
            COLORS.gray
        );
    }


    if (
        hoverTarget &&
        hoverTarget.type ===
        "shapeTetra"
    ) {
        drawSelectionFrame(
            view,
            panel.tetra,
            COLORS.gray
        );
    }
}


// ==================================================
// オブジェクト追加アイコン
// ==================================================

function drawAddButton(view) {
    const color =
        (
            hoverTarget &&
            hoverTarget.type ===
            "add"
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


    gl.useProgram(
        program
    );


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


    const rayColor =
        (
            isDragging ||
            isRotating
        )
            ? COLORS.green
            : COLORS.white;


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
// オブジェクト追加
// 中央寄りに追加
// ==================================================

function addNewObject() {
    const offset =
        Math.max(
            0,
            boxes.length - 3
        ) *
        0.18;


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
}


// ==================================================
// ゴール判定
//
// 現段階では「赤」で判定。
// 次のゲーム化段階で形状判定を追加可能。
// ==================================================

function checkGoal() {
    gameCleared =
        false;


    for (
        const box
        of boxes
    ) {
        if (
            box.colorName !==
            "red"
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
                "正解！ 赤いオブジェクトをゴールに置けました。";


            return;
        }
    }


    status.textContent =
        "赤いオブジェクトを赤い枠の中へ移動してください。";
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
    // 移動中
    // ==================================================

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
    }


    // ==================================================
    // 回転中
    // ==================================================

    else if (
        isRotating &&
        rotationInputSource &&
        selectedBoxIndex !== null
    ) {
        const ray =
            getRay(
                frame,
                rotationInputSource
            );


        if (ray) {
            currentRay =
                ray;


            const box =
                boxes[
                    selectedBoxIndex
                ];


            if (
                rotationMode ===
                "horizontal"
            ) {
                const angle =
                    getHorizontalRayAngle(
                        ray.direction
                    );


                const delta =
                    normalizeAngleDelta(
                        angle -
                        rotationStartRayAngle
                    );


                box.rotationY =
                    rotationStartObjectAngle +
                    delta;
            }


            if (
                rotationMode ===
                "vertical"
            ) {
                const angle =
                    getVerticalRayAngle(
                        ray.direction
                    );


                const delta =
                    normalizeAngleDelta(
                        angle -
                        rotationStartRayAngle
                    );


                box.rotationX =
                    rotationStartObjectAngle -
                    delta;
            }
        }
    }


    // ==================================================
    // 通常
    // ==================================================

    else {
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


        drawGoal(view);

        drawObjects(view);

        drawAddButton(view);

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
    if (
        !window.isSecureContext
    ) {
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


            if (!gl) {
                throw new Error(
                    "WebGLを開始できませんでした。"
                );
            }


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
                "オブジェクトを選択すると右側に操作パネルが表示されます。";


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


                    // ==========================================
                    // 追加
                    // ==========================================

                    if (
                        target.type ===
                        "add"
                    ) {
                        addNewObject();
                        return;
                    }


                    // ==========================================
                    // サイズ -
                    // ==========================================

                    if (
                        target.type ===
                        "sizeMinus"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];


                        if (box) {
                            box.scale =
                                Math.max(
                                    0.4,
                                    box.scale -
                                    0.2
                                );


                            checkGoal();
                        }


                        return;
                    }


                    // ==========================================
                    // サイズ +
                    // ==========================================

                    if (
                        target.type ===
                        "sizePlus"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];


                        if (box) {
                            box.scale =
                                Math.min(
                                    2.5,
                                    box.scale +
                                    0.2
                                );


                            checkGoal();
                        }


                        return;
                    }


                    // ==========================================
                    // 縦回転
                    // ==========================================

                    if (
                        target.type ===
                        "rotateVertical"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];


                        if (!box) {
                            return;
                        }


                        isRotating =
                            true;

                        rotationMode =
                            "vertical";

                        rotationInputSource =
                            event.inputSource;


                        rotationStartRayAngle =
                            getVerticalRayAngle(
                                ray.direction
                            );


                        rotationStartObjectAngle =
                            box.rotationX;


                        return;
                    }


                    // ==========================================
                    // 横回転
                    // ==========================================

                    if (
                        target.type ===
                        "rotateHorizontal"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];


                        if (!box) {
                            return;
                        }


                        isRotating =
                            true;

                        rotationMode =
                            "horizontal";

                        rotationInputSource =
                            event.inputSource;


                        rotationStartRayAngle =
                            getHorizontalRayAngle(
                                ray.direction
                            );


                        rotationStartObjectAngle =
                            box.rotationY;


                        return;
                    }


                    // ==========================================
                    // 色
                    // ==========================================

                    if (
                        target.type ===
                        "colorRed"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];

                        if (box) {
                            box.colorName =
                                "red";

                            box.color =
                                COLORS.red;

                            checkGoal();
                        }

                        return;
                    }


                    if (
                        target.type ===
                        "colorBlue"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];

                        if (box) {
                            box.colorName =
                                "blue";

                            box.color =
                                COLORS.blue;

                            checkGoal();
                        }

                        return;
                    }


                    if (
                        target.type ===
                        "colorGreen"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];

                        if (box) {
                            box.colorName =
                                "green";

                            box.color =
                                COLORS.green;

                            checkGoal();
                        }

                        return;
                    }


                    // ==========================================
                    // 形状
                    // ==========================================

                    if (
                        target.type ===
                        "shapeCube"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];

                        if (box) {
                            box.shape =
                                "cube";
                        }

                        return;
                    }


                    if (
                        target.type ===
                        "shapeSphere"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];

                        if (box) {
                            box.shape =
                                "sphere";
                        }

                        return;
                    }


                    if (
                        target.type ===
                        "shapeTetra"
                    ) {
                        const box =
                            boxes[
                                selectedBoxIndex
                            ];

                        if (box) {
                            box.shape =
                                "tetra";
                        }

                        return;
                    }


                    // ==========================================
                    // オブジェクト移動
                    // ==========================================

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


                        pressStartCenter = [
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


            // ==================================================
            // 選択終了
            // ==================================================

            xrSession.addEventListener(
                "selectend",
                (event) => {

                    // 回転終了
                    if (
                        isRotating &&
                        event.inputSource ===
                        rotationInputSource
                    ) {
                        isRotating =
                            false;

                        rotationMode =
                            null;

                        rotationInputSource =
                            null;

                        rotationStartRayAngle =
                            0;

                        rotationStartObjectAngle =
                            0;

                        return;
                    }


                    // 移動終了
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


                        if (
                            moved < 0.08
                        ) {
                            box.center = [
                                ...pressStartCenter
                            ];
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


                    selectedBoxIndex =
                        null;


                    isRotating =
                        false;

                    rotationMode =
                        null;

                    rotationInputSource =
                        null;


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

            console.error(
                error
            );


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