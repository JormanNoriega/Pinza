const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const degToRad = (degrees) => (degrees * Math.PI) / 180;
const CONTACT_ANGLE = 3.2;

export const DEFAULT_PARAMETERS = {
    inputForce: 180,
    d1: 6.2,
    d2: 1.8,
    openAngle: 18,
    handleLength: 7.4,
    jawLength: 2.6,
    visualScale: 1,
};

export const DEFAULT_DURATION_SECONDS = 2.4;

export const PARAMETER_SECTIONS = [
    {
        title: "Modelo estático simple",
        description: "La pinza se trata como una palanca de primer grado con un único grado de libertad angular alrededor del fulcro.",
        fields: [
            {
                key: "inputForce",
                label: "Fuerza de entrada",
                unit: "N",
                min: 20,
                max: 650,
                step: 5,
                decimals: 0,
                hint: "Magnitud de la fuerza máxima que se aplicará durante el evento.",
            },
            {
                key: "d1",
                label: "Brazo de potencia d1",
                unit: "cm",
                min: 1.5,
                max: (state) => state.handleLength - 0.45,
                step: 0.05,
                decimals: 2,
                hint: "Distancia desde el fulcro hasta el punto donde actúa la fuerza de entrada.",
            },
            {
                key: "d2",
                label: "Brazo de resistencia d2",
                unit: "cm",
                min: 0.5,
                max: (state) => state.jawLength - 0.15,
                step: 0.05,
                decimals: 2,
                hint: "Distancia desde el fulcro hasta la zona de contacto en la mordaza.",
            },
            {
                key: "openAngle",
                label: "Ángulo de apertura",
                unit: "°",
                min: 6,
                max: 34,
                step: 0.5,
                decimals: 1,
                hint: "Apertura inicial de la pinza cuando no se aplica carga.",
            },
        ],
    },
    {
        title: "Geometría visual",
        description: "Estos parámetros cambian la forma en pantalla, pero no alteran la ley ideal de la palanca.",
        fields: [
            {
                key: "handleLength",
                label: "Longitud de mangos",
                unit: "cm",
                min: 4.5,
                max: 11,
                step: 0.1,
                decimals: 2,
                hint: "Longitud geométrica del brazo posterior.",
            },
            {
                key: "jawLength",
                label: "Longitud de mordazas",
                unit: "cm",
                min: 1.2,
                max: 4.6,
                step: 0.05,
                decimals: 2,
                hint: "Longitud geométrica del brazo delantero.",
            },
            {
                key: "visualScale",
                label: "Escala visual",
                unit: "x",
                min: 0.7,
                max: 1.6,
                step: 0.05,
                decimals: 2,
                hint: "Escala global del modelo 3D en la escena.",
            },
        ],
    },
];

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function smoothStep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
}

function pulseProfile(normalizedTime) {
    const t = clamp(normalizedTime, 0, 1);

    if (t <= 0.25) {
        return smoothStep(t / 0.25);
    }

    if (t <= 0.75) {
        return 1;
    }

    return 1 - smoothStep((t - 0.75) / 0.25);
}

export function normalizeParameters(rawState = {}) {
    const state = { ...DEFAULT_PARAMETERS, ...rawState };

    const normalized = {
        inputForce: clamp(toNumber(state.inputForce, DEFAULT_PARAMETERS.inputForce), 20, 650),
        openAngle: clamp(toNumber(state.openAngle, DEFAULT_PARAMETERS.openAngle), 6, 34),
        handleLength: clamp(toNumber(state.handleLength, DEFAULT_PARAMETERS.handleLength), 4.5, 11),
        jawLength: clamp(toNumber(state.jawLength, DEFAULT_PARAMETERS.jawLength), 1.2, 4.6),
        visualScale: clamp(toNumber(state.visualScale, DEFAULT_PARAMETERS.visualScale), 0.7, 1.6),
    };

    normalized.d1 = clamp(toNumber(state.d1, DEFAULT_PARAMETERS.d1), 1.5, normalized.handleLength - 0.45);
    normalized.d2 = clamp(toNumber(state.d2, DEFAULT_PARAMETERS.d2), 0.5, normalized.jawLength - 0.15);

    return normalized;
}

function computeJawGap(length, angle) {
    return Math.max(0.16, 2 * length * Math.sin(degToRad(angle) / 2));
}

function computeVisualAngle(inputs, forceProgress) {
    const restAngle = inputs.openAngle;
    const normalizedForce = clamp(forceProgress, 0, 1);
    return restAngle - (restAngle - CONTACT_ANGLE) * normalizedForce;
}

function buildGraphSamples(graphHistory, durationSeconds) {
    if (graphHistory.length > 1) {
        return graphHistory;
    }

    return [
        { time: 0, inputForce: 0, outputForce: 0 },
        { time: durationSeconds, inputForce: 0, outputForce: 0 },
    ];
}

export function calculateSimulation(rawState = {}, runtime = {}) {
    const inputs = normalizeParameters(rawState);
    const durationSeconds = clamp(Number(runtime.durationSeconds ?? DEFAULT_DURATION_SECONDS), 0.8, 10);
    const elapsedSeconds = clamp(Number(runtime.elapsedSeconds ?? 0), 0, durationSeconds);
    const eventProgress = durationSeconds > 0 ? elapsedSeconds / durationSeconds : 0;
    const forceProgress = clamp(Number(runtime.forceProgress ?? 0), 0, 1);
    const activeInputForce = inputs.inputForce * forceProgress;
    const idealMechanicalAdvantage = inputs.d1 / inputs.d2;
    const inverseRatio = inputs.d2 / inputs.d1;
    const outputForce = activeInputForce * idealMechanicalAdvantage;
    const torqueInput = activeInputForce * inputs.d1;
    const torqueOutput = outputForce * inputs.d2;
    const supportReaction = activeInputForce + outputForce;

    const restOpenAngle = inputs.openAngle;
    const effectiveOpenAngle = computeVisualAngle(inputs, forceProgress);
    const restJawGap = computeJawGap(inputs.jawLength, restOpenAngle);
    const jawGap = computeJawGap(inputs.jawLength, effectiveOpenAngle);
    const handleSpan = computeJawGap(inputs.handleLength, effectiveOpenAngle);
    const closureRatio = restOpenAngle > CONTACT_ANGLE
        ? (restOpenAngle - effectiveOpenAngle) / (restOpenAngle - CONTACT_ANGLE)
        : 0;

    const graphHistory = Array.isArray(runtime.graphHistory) ? runtime.graphHistory : [];
    const graphSamples = buildGraphSamples(graphHistory, durationSeconds);
    const graphYMax = Math.max(inputs.inputForce, inputs.inputForce * idealMechanicalAdvantage, 50) * 1.12;

    let stateLabel = "Sin fuerza aplicada";
    if (runtime.isRunning) {
        stateLabel = forceProgress > 0.01 ? "Aplicación progresiva" : "Preparando evento";
    } else if (graphHistory.length > 1) {
        stateLabel = "Evento completado";
    }

    let equilibriumLabel = "Sistema en reposo";
    if (forceProgress > 0.01) {
        equilibriumLabel = "Equilibrio ideal de momentos";
    } else if (graphHistory.length > 1 && !runtime.isRunning) {
        equilibriumLabel = "Evento finalizado";
    }

    let advantageLabel = "Baja";
    if (idealMechanicalAdvantage >= 3) {
        advantageLabel = "Alta";
    } else if (idealMechanicalAdvantage >= 1.8) {
        advantageLabel = "Media";
    }

    const observations = [
        `La ley principal sigue siendo F_entrada * d1 = F_salida * d2 y la ventaja mecánica ideal vale ${idealMechanicalAdvantage.toFixed(2)}x.`,
        runtime.isRunning
            ? `La carga se está aplicando con un perfil suave durante ${durationSeconds.toFixed(1)} s. Ahora mismo circulan ${activeInputForce.toFixed(1)} N en la entrada y ${outputForce.toFixed(1)} N en la salida.`
            : `El evento de fuerza está configurado para durar ${durationSeconds.toFixed(1)} s. Al pulsar el botón, la gráfica registrará cómo evolucionan la entrada y la salida en ese intervalo.`,
        `La reacción vertical del apoyo se calcula como R = F_entrada + F_salida, así que en este instante vale ${supportReaction.toFixed(1)} N.`,
        `El único grado de libertad visual es el giro alrededor del fulcro; la transición temporal es suave, pero el equilibrio sigue siendo estático en cada instante.`,
    ];

    return {
        inputs,
        load: {
            progress: forceProgress,
            isApplied: forceProgress > 0.01,
            isRunning: Boolean(runtime.isRunning),
            stateLabel,
            activeInputForce,
            elapsedSeconds,
            durationSeconds,
            timelineProgress: eventProgress,
            profilePreview: pulseProfile(eventProgress),
        },
        ideal: {
            outputForce: inputs.inputForce * idealMechanicalAdvantage,
            idealOutputForce: inputs.inputForce * idealMechanicalAdvantage,
            mechanicalAdvantage: idealMechanicalAdvantage,
            inverseRatio,
        },
        actual: {
            outputForce,
            mechanicalAdvantage: forceProgress > 0.01 ? idealMechanicalAdvantage : 0,
            torqueOutput,
            reactionForce: supportReaction,
        },
        potential: {
            outputForce: inputs.inputForce * idealMechanicalAdvantage,
            torqueInput: inputs.inputForce * inputs.d1,
            torqueOutput: inputs.inputForce * inputs.d1,
            mechanicalAdvantage: idealMechanicalAdvantage,
            jawGap: computeJawGap(inputs.jawLength, computeVisualAngle(inputs, 1)),
            effectiveOpenAngle: computeVisualAngle(inputs, 1),
            reactionForce: inputs.inputForce + inputs.inputForce * idealMechanicalAdvantage,
        },
        moments: {
            torqueInput,
            torqueOutput,
            torqueLoss: 0,
            residualRatio: 0,
        },
        scene: {
            requestedOpenAngle: inputs.openAngle,
            effectiveOpenAngle,
            restOpenAngle,
            jawGap,
            handleSpan,
            restJawGap,
            closureRatio,
            limitedByStop: false,
        },
        status: {
            equilibriumLabel,
            equilibriumTone: forceProgress > 0.01 ? "good" : "warn",
            advantageLabel,
            systemObservation: runtime.isRunning
                ? "La fuerza crece y decrece suavemente, pero la relación entre momentos sigue siendo ideal en cada instante."
                : "El sistema espera un nuevo evento de carga para volver a registrar la curva temporal.",
        },
        texts: {
            equation: forceProgress > 0.01
                ? `F_salida = (${activeInputForce.toFixed(1)} * ${inputs.d1.toFixed(2)}) / ${inputs.d2.toFixed(2)} = ${outputForce.toFixed(1)} N.`
                : `En el pico del evento, F_salida = (${inputs.inputForce.toFixed(1)} * ${inputs.d1.toFixed(2)}) / ${inputs.d2.toFixed(2)} = ${(inputs.inputForce * idealMechanicalAdvantage).toFixed(1)} N.`,
            geometry: `ΣFy = 0 => R = F_entrada + F_salida. Con la configuración actual, VM = d1 / d2 = ${idealMechanicalAdvantage.toFixed(2)}x.`,
        },
        graph: {
            xMax: durationSeconds,
            yMax: graphYMax,
            samples: graphSamples,
            activePoint: {
                time: elapsedSeconds,
                inputForce: activeInputForce,
                outputForce,
            },
            configuredPoint: {
                time: durationSeconds * 0.25,
                inputForce: inputs.inputForce,
                outputForce: inputs.inputForce * idealMechanicalAdvantage,
            },
        },
        observations,
    };
}
