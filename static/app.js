import {
    DEFAULT_PARAMETERS,
    DEFAULT_DURATION_SECONDS,
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
const durationInput = document.getElementById("force-duration-input");

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
    elapsedSeconds: 0,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    animationFrameId: null,
    isRunning: false,
    lastTimestamp: 0,
    graphHistory: [],
};

syncDurationInput();
durationInput?.addEventListener("input", handleDurationChange);
durationInput?.addEventListener("change", handleDurationChange);

setupActionButtons({
    onReset: () => {
        state = { ...DEFAULT_PARAMETERS, ...bootstrapDefaults };
        resetRuntime(true);
        syncDurationInput();
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
    if (key === "handleLength") {
        state = {
            ...state,
            handleLength: value,
            handleLengthBase: value - (Number(state.pivotOffset) || 0),
        };
    } else if (key === "jawLength") {
        state = {
            ...state,
            jawLength: value,
            jawLengthBase: value + (Number(state.pivotOffset) || 0),
        };
    } else {
        state = { ...state, [key]: value };
    }

    resetRuntime(true);
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

function handleDurationChange() {
    runtime.durationSeconds = clampDuration(durationInput?.value);
    resetRuntime(true);
    syncDurationInput();
    refresh(false);
}

function setForceApplied(isApplied) {
    if (!isApplied) {
        resetRuntime(true);
        refresh(false);
        return;
    }

    resetRuntime(true);
    runtime.isRunning = true;
    runtime.lastTimestamp = 0;
    runtime.graphHistory = [{ time: 0, inputForce: 0, outputForce: 0 }];
    refresh(false);
    runtime.animationFrameId = window.requestAnimationFrame(stepForceAnimation);
}

function stepForceAnimation(timestamp) {
    if (!runtime.isRunning) {
        return;
    }

    if (!runtime.lastTimestamp) {
        runtime.lastTimestamp = timestamp;
    }

    const delta = Math.min((timestamp - runtime.lastTimestamp) / 1000, 0.05);
    runtime.lastTimestamp = timestamp;
    runtime.elapsedSeconds = Math.min(runtime.elapsedSeconds + delta, runtime.durationSeconds);

    const normalizedTime = runtime.durationSeconds > 0 ? runtime.elapsedSeconds / runtime.durationSeconds : 0;
    runtime.forceProgress = pulseProfile(normalizedTime);
    pushGraphSample();
    refresh(false);

    if (runtime.elapsedSeconds >= runtime.durationSeconds) {
        runtime.isRunning = false;
        runtime.forceProgress = 0;
        runtime.lastTimestamp = 0;
        pushGraphSample(runtime.durationSeconds, 0, 0);
        runtime.animationFrameId = null;
        refresh(false);
        return;
    }

    runtime.animationFrameId = window.requestAnimationFrame(stepForceAnimation);
}

function pulseProfile(normalizedTime) {
    const t = Math.min(1, Math.max(0, normalizedTime));
    if (t <= 0.25) {
        return smoothStep(t / 0.25);
    }
    if (t <= 0.75) {
        return 1;
    }
    return 1 - smoothStep((t - 0.75) / 0.25);
}

function smoothStep(value) {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
}

function pushGraphSample(time = runtime.elapsedSeconds, inputForce, outputForce) {
    const currentInput = inputForce ?? state.inputForce * runtime.forceProgress;
    const currentOutput = outputForce ?? currentInput * (state.d1 / state.d2);
    const lastSample = runtime.graphHistory[runtime.graphHistory.length - 1];

    if (lastSample && Math.abs(lastSample.time - time) < 0.0001) {
        lastSample.inputForce = currentInput;
        lastSample.outputForce = currentOutput;
        return;
    }

    runtime.graphHistory.push({
        time,
        inputForce: currentInput,
        outputForce: currentOutput,
    });
}

function resetRuntime(clearGraph = false) {
    if (runtime.animationFrameId) {
        window.cancelAnimationFrame(runtime.animationFrameId);
        runtime.animationFrameId = null;
    }

    runtime.forceProgress = 0;
    runtime.elapsedSeconds = 0;
    runtime.isRunning = false;
    runtime.lastTimestamp = 0;

    if (clearGraph) {
        runtime.graphHistory = [];
    }
}

function syncDurationInput() {
    runtime.durationSeconds = clampDuration(durationInput?.value ?? runtime.durationSeconds);
    if (durationInput) {
        durationInput.value = runtime.durationSeconds.toFixed(1);
    }
}

function clampDuration(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_DURATION_SECONDS;
    }

    return Math.min(10, Math.max(0.8, parsed));
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
