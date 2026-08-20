const xrButton = document.getElementById("xrButton");
const status = document.getElementById("status");

let xrSession = null;

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
        const supported =
            await navigator.xr.isSessionSupported("immersive-ar");

        if (supported) {
            xrButton.disabled = false;
            xrButton.textContent = "MR体験を開始";
            status.textContent = "Immersive AR対応";
        } else {
            xrButton.textContent = "AR非対応";
            status.textContent = "immersive-arを利用できません。";
        }

    } catch (error) {
        status.textContent =
            "WebXR確認エラー: " + error.message;
    }
}

xrButton.addEventListener("click", async () => {

    if (!xrSession) {

        try {
            xrSession =
                await navigator.xr.requestSession("immersive-ar");

            xrButton.textContent = "MR体験を終了";

            xrSession.addEventListener("end", () => {
                xrSession = null;
                xrButton.textContent = "MR体験を開始";
            });

        } catch (error) {
            status.textContent =
                "MR開始エラー: " + error.message;
        }

    } else {
        xrSession.end();
    }
});

checkXR();