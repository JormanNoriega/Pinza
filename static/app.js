import {
    DEFAULT_PARAMETERS,
    PARAMETER_SECTIONS,
    calculateSimulation,
} from "./js/model.js";
import {
    createControlPanel,
    setupActionButtons,
    updateDashboard,
} from "./js/uiControls.js";
import { renderForceGraph } from "./js/forceGraph.js";

const defaultsNode = document.getElementById("app-defaults");
const bootstrapDefaults = defaultsNode ? JSON.parse(defaultsNode.textContent || "{}") : {};
const initialState = { ...DEFAULT_PARAMETERS, ...bootstrapDefaults };

const sceneContainer = document.getElementById("three-container");
const controlsRoot = document.getElementById("controls-root");

const controls = createControlPanel({
    container: controlsRoot,
    sections: PARAMETER_SECTIONS,
    initialState,
    onParameterChange: handleParameterChange,
});

let scene = null;
let state = { ...initialState };
const runtime = {
    forceProgress: 0,
    targetForceProgress: 0,
    animationFrameId: null,
    lastTimestamp: 0,
};

setupActionButtons({
    onReset: () => {
        state = { ...DEFAULT_PARAMETERS, ...bootstrapDefaults };
        stopForceAnimation(true);
        refresh(true);
    },
    onFocus: () => scene?.focus(),
    onToggleAxes: () => scene?.toggleAxes(),
    onApplyForce: () => setForceApplied(true),
    onReleaseForce: () => setForceApplied(false),
});

refresh(true);
initializeScene();

function handleParameterChange(key, value) {
    state = { ...state, [key]: value };
    refresh(true);
}

function refresh(syncControls = false) {
    const simulation = calculateSimulation(state, runtime);
    state = { ...simulation.inputs };

    if (syncControls) {
        controls.setValues(state);
    }

    updateDashboard(simulation);
    renderForceGraph(simulation);
    scene?.update(simulation);
}

function setForceApplied(isApplied) {
    runtime.targetForceProgress = isApplied ? 1 : 0;

    if (!runtime.animationFrameId) {
        runtime.lastTimestamp = 0;
        runtime.animationFrameId = window.requestAnimationFrame(stepForceAnimation);
    }
}

function stopForceAnimation(resetProgress = false) {
    if (runtime.animationFrameId) {
        window.cancelAnimationFrame(runtime.animationFrameId);
        runtime.animationFrameId = null;
    }

    runtime.lastTimestamp = 0;
    runtime.targetForceProgress = 0;

    if (resetProgress) {
        runtime.forceProgress = 0;
    }
}

function stepForceAnimation(timestamp) {
    if (!runtime.lastTimestamp) {
        runtime.lastTimestamp = timestamp;
    }

    const delta = Math.min((timestamp - runtime.lastTimestamp) / 1000, 0.05);
    runtime.lastTimestamp = timestamp;

    const responseRate = 4.8 / Math.max(state.mass || 1.2, 0.35);
    const dampingFactor = Math.max(0.18, 1 - (state.damping || 0.35) * 0.32);
    const deltaProgress = (runtime.targetForceProgress - runtime.forceProgress) * Math.min(1, delta * responseRate * dampingFactor);
    runtime.forceProgress = Math.min(1, Math.max(0, runtime.forceProgress + deltaProgress));

    refresh(false);

    if (Math.abs(runtime.targetForceProgress - runtime.forceProgress) < 0.0025) {
        runtime.forceProgress = runtime.targetForceProgress;
        runtime.animationFrameId = null;
        runtime.lastTimestamp = 0;
        refresh(false);
        return;
    }

    runtime.animationFrameId = window.requestAnimationFrame(stepForceAnimation);
}

async function initializeScene() {
    try {
        const { PliersScene } = await import("./js/threeScene.js");
        scene = new PliersScene(sceneContainer);
        refresh(false);
    } catch (error) {
        console.error("No se pudo inicializar la escena 3D:", error);
        sceneContainer.innerHTML = `
            <div class="scene-fallback">
                <strong>No se pudo cargar la vista 3D.</strong>
                <p>El panel de parámetros y los cálculos siguen disponibles. Revisa la consola del navegador y la conexión si Three.js fue bloqueado.</p>
            </div>
        `;
    }
}
