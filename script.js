const canvas = document.getElementById("skin-canvas");
const fileInput = document.getElementById("skin-file");
const dropZone = document.getElementById("drop-zone");
const statusText = document.getElementById("status");
const playerSearchInput = document.getElementById("player-search");
const fetchSkinBtn = document.getElementById("fetch-skin-btn");
const animationToggle = document.getElementById("animation-toggle");

let viewer;

function setStatus(message, isError = false) {
    statusText.innerHTML = message;
    statusText.style.color = isError ? "#f87171" : "var(--text-muted)";
}

async function fetchSkinFromMojang(usernameOrUUID) {
    if (!viewer) {
        setStatus("Viewer is still starting up. Please try again in a second.", true);
        return;
    }

    const input = usernameOrUUID.trim();
    if (!input) {
        setStatus("Please enter a username or UUID.", true);
        return;
    }

    fetchSkinBtn.disabled = true;
    setStatus("Fetching skin from Mojang...");

    try {
        let uuid = input;
        let playerName = input;

        // If input looks like a username (not a UUID), fetch the UUID first
        if (!input.match(/^[0-9a-f]{32}$/i) && !input.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            // Use custom proxy for the API request
            const mojangUrl = `https://api.mojang.com/users/profiles/minecraft/${input}`;
            const profileResponse = await fetch(`https://choculaterie.com/api/MojangProxy?endpoint=${encodeURIComponent(mojangUrl)}`);

            if (!profileResponse.ok) {
                if (profileResponse.status === 404) {
                    setStatus(`Player "${input}" not found.`, true);
                } else {
                    setStatus("Failed to fetch player profile. Try again later.", true);
                }
                return;
            }

            const profileData = await profileResponse.json();
            uuid = profileData.id;
            playerName = profileData.name;
        }

        // Remove dashes from UUID if present
        uuid = uuid.replace(/-/g, '');

        // Fetch the profile with textures using custom proxy
        const sessionUrl = `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`;
        const sessionResponse = await fetch(`https://choculaterie.com/api/MojangProxy?endpoint=${encodeURIComponent(sessionUrl)}`);

        if (!sessionResponse.ok) {
            setStatus("Failed to fetch skin data.", true);
            return;
        }

        const sessionData = await sessionResponse.json();
        playerName = sessionData.name;

        // Decode the base64 textures property
        const texturesProperty = sessionData.properties.find(prop => prop.name === "textures");
        if (!texturesProperty) {
            setStatus("No skin data found for this player.", true);
            return;
        }

        const texturesJson = JSON.parse(atob(texturesProperty.value));
        const skinUrl = texturesJson.textures.SKIN?.url;

        if (!skinUrl) {
            setStatus("No skin found for this player.", true);
            return;
        }

        // Load the skin directly (textures.minecraft.net doesn't need CORS proxy)
        await viewer.loadSkin(skinUrl);

        // Save to localStorage
        localStorage.setItem('currentSkin', skinUrl);
        localStorage.setItem('currentPlayerName', playerName);

        setStatus(`Loaded skin for <strong>${playerName}</strong>! Scroll to zoom and drag to orbit.`, false);

    } catch (error) {
        console.error("Error fetching skin:", error);
        setStatus("An error occurred while fetching the skin. Please try again.", true);
    } finally {
        fetchSkinBtn.disabled = false;
    }
}

async function initializeViewer() {
    viewer = new skinview3d.SkinViewer({
        canvas,
        width: canvas.width,
        height: canvas.height,
    });

    // Fine-tune the bundled orbit controls for mouse / touch interaction.
    if (viewer.controls) {
        viewer.controls.enablePan = false;
        viewer.controls.enableDamping = true;
        viewer.controls.dampingFactor = 0.08;
        viewer.controls.enableZoom = true;
        viewer.controls.minDistance = 15;
        viewer.controls.maxDistance = 65;
    }

    // Load animation preference from localStorage
    const animationEnabled = localStorage.getItem('animationEnabled') !== 'false';
    if (animationEnabled) {
        viewer.animation = new skinview3d.WalkingAnimation();
        viewer.animation.speed = 1.2;
    }

    // Set toggle state from localStorage
    if (animationToggle) {
        animationToggle.checked = animationEnabled;
    }

    viewer.fov = 50;
    viewer.zoom = 0.9;

    // Load saved skin from localStorage
    const savedSkin = localStorage.getItem('currentSkin');
    if (savedSkin) {
        try {
            await viewer.loadSkin(savedSkin);
            const savedPlayerName = localStorage.getItem('currentPlayerName');
            if (savedPlayerName) {
                setStatus(`Loaded saved skin for <strong>${savedPlayerName}</strong>! Scroll to zoom and drag to orbit.`, false);
            } else {
                setStatus("Loaded saved skin! Scroll to zoom and drag to orbit.", false);
            }
        } catch (error) {
            setStatus("Ready! Upload a skin file or fetch one by username.", false);
            localStorage.removeItem('currentSkin');
            localStorage.removeItem('currentPlayerName');
        }
    } else {
        setStatus("Ready! Upload a skin file or fetch one by username.", false);
    }
}

function readSkinFile(file) {
    if (!viewer) {
        setStatus("Viewer is still starting up. Please try again in a second.", true);
        return;
    }
    if (!file) return;

    const isPNG = file.type === "image/png" || file.name.endsWith(".png");
    if (!isPNG) {
        setStatus("Please select a PNG file (e.g. skin.png).", true);
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        setStatus("That file is quite large. Try a file under 5 MB.", true);
        return;
    }

    setStatus("Loading skin…");

    const reader = new FileReader();
    reader.addEventListener("load", async (event) => {
        try {
            const skinData = event.target.result;
            await viewer.loadSkin(skinData);

            // Save to localStorage
            localStorage.setItem('currentSkin', skinData);
            localStorage.removeItem('currentPlayerName'); // Clear player name for uploaded files

            setStatus(
                "Skin loaded! Scroll to zoom and drag the preview to orbit.",
                false
            );
        } catch (error) {
            console.error(error);
            setStatus("Something went wrong reading that skin file.", true);
        }
    });

    reader.addEventListener("error", () => {
        setStatus("Could not read that file. Please try again.", true);
    });

    reader.readAsDataURL(file);
}

function handleFiles(files) {
    if (!files || !files.length) {
        setStatus("No file detected. Drop a Minecraft skin PNG.", true);
        return;
    }
    readSkinFile(files[0]);
}

function wireEvents() {
    fileInput.addEventListener("change", (event) => {
        handleFiles(event.target.files);
        fileInput.value = ""; // reset so the same file can be reloaded
    });

    const toggleDragState = (isActive) => {
        dropZone.classList.toggle("dragover", isActive);
    };

    ["dragenter", "dragover"].forEach((type) => {
        dropZone.addEventListener(type, (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleDragState(true);
        });
    });

    ["dragleave", "dragend"].forEach((type) => {
        dropZone.addEventListener(type, (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleDragState(false);
        });
    });

    dropZone.addEventListener("drop", (event) => {
        event.preventDefault();
        toggleDragState(false);
        handleFiles(event.dataTransfer.files);
    });

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("keypress", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            fileInput.click();
        }
    });

    // Username/UUID fetch events
    fetchSkinBtn.addEventListener("click", () => {
        fetchSkinFromMojang(playerSearchInput.value);
    });

    playerSearchInput.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            fetchSkinFromMojang(playerSearchInput.value);
        }
    });

    // Animation toggle event
    animationToggle.addEventListener("change", (event) => {
        if (!viewer) return;

        const isEnabled = event.target.checked;

        if (isEnabled) {
            // Enable animation
            viewer.animation = new skinview3d.WalkingAnimation();
            viewer.animation.speed = 1.2;
        } else {
            // Disable animation
            viewer.animation = null;
        }

        // Save preference to localStorage
        localStorage.setItem('animationEnabled', isEnabled);
    });
}

window.addEventListener("DOMContentLoaded", () => {
    initializeViewer();
    wireEvents();
});
