const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const degToRad = (degrees) => (degrees * Math.PI) / 180;
const MINIMUM_CONTACT_ANGLE = 1.9;

export const DEFAULT_PARAMETERS = {
    inputForce: 180,
    d1: 6.2,
    d2: 1.8,
    openAngle: 18,
    angleLimit: 32,
    handleLength: 7.4,
    jawLength: 2.6,
    visualScale: 1,
    friction: 0.08,
    rigidity: 90,
    mass: 1.2,
    damping: 0.35,
};

export const PARAMETER_SECTIONS = [
    {
        title: "Geometría y carga",
        description: "Controla la fuerza aplicada, las distancias al fulcro y la forma general del alicate.",
        fields: [
            {
                key: "inputForce",
                label: "Fuerza de entrada",
                unit: "N",
                min: 20,
                max: 650,
                step: 5,
                decimals: 0,
                hint: "Magnitud de la carga que se aplicará cuando pulses el botón superior.",
            },
            {
                key: "d1",
                label: "Distancia d1",
                unit: "cm",
                min: 1.5,
                max: (state) => state.handleLength - 0.45,
                step: 0.05,
                decimals: 2,
                hint: "Distancia desde el fulcro hasta el punto donde se aplica la fuerza.",
            },
            {
                key: "d2",
                label: "Distancia d2",
                unit: "cm",
                min: 0.5,
                max: (state) => state.jawLength - 0.15,
                step: 0.05,
                decimals: 2,
                hint: "Distancia desde el fulcro hasta la zona activa de contacto en la mordaza.",
            },
            {
                key: "openAngle",
                label: "Ángulo de apertura inicial",
                unit: "°",
                min: 4,
                max: 42,
                step: 0.5,
                decimals: 1,
                hint: "Apertura de reposo antes de aplicar la fuerza en los mangos.",
            },
            {
                key: "angleLimit",
                label: "Límite angular",
                unit: "°",
                min: 8,
                max: 45,
                step: 0.5,
                decimals: 1,
                hint: "Tope mecánico máximo permitido por la articulación.",
            },
            {
                key: "handleLength",
                label: "Longitud de mangos",
                unit: "cm",
                min: 4.5,
                max: 11,
                step: 0.1,
                decimals: 2,
                hint: "Longitud geométrica del brazo posterior donde se transmite la fuerza de entrada.",
            },
            {
                key: "jawLength",
                label: "Longitud de mordazas",
                unit: "cm",
                min: 1.2,
                max: 4.6,
                step: 0.05,
                decimals: 2,
                hint: "Longitud del tramo delantero encargado de cerrar y sujetar.",
            },
            {
                key: "visualScale",
                label: "Escala visual",
                unit: "x",
                min: 0.7,
                max: 1.6,
                step: 0.05,
                decimals: 2,
                hint: "Escala global del modelo 3D sin alterar las relaciones mecánicas.",
            },
        ],
    },
    {
        title: "Parámetros extendidos",
        description: "No cambian la ley base de la palanca, pero añaden pérdidas y respuesta visual más realista.",
        fields: [
            {
                key: "friction",
                label: "Fricción en articulación",
                unit: "",
                min: 0,
                max: 0.45,
                step: 0.01,
                decimals: 2,
                hint: "Factor simplificado de pérdidas en el pivote.",
            },
            {
                key: "rigidity",
                label: "Rigidez estructural",
                unit: "%",
                min: 60,
                max: 100,
                step: 1,
                decimals: 0,
                hint: "Representa qué tan bien transmite el momento la estructura sin deformarse.",
            },
            {
                key: "mass",
                label: "Masa efectiva",
                unit: "kg",
                min: 0.5,
                max: 4,
                step: 0.1,
                decimals: 1,
                hint: "Afecta la sensación de inercia en la animación y el costo dinámico del sistema.",
            },
            {
                key: "damping",
                label: "Amortiguamiento",
                unit: "",
                min: 0.05,
                max: 0.9,
                step: 0.01,
                decimals: 2,
                hint: "Suaviza la respuesta angular y reduce oscilaciones al moverse.",
            },
        ],
    },
];

function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeParameters(rawState = {}) {
    const state = { ...DEFAULT_PARAMETERS, ...rawState };

    const normalized = {
        inputForce: clamp(toNumber(state.inputForce, DEFAULT_PARAMETERS.inputForce), 20, 650),
        openAngle: clamp(toNumber(state.openAngle, DEFAULT_PARAMETERS.openAngle), 4, 42),
        angleLimit: clamp(toNumber(state.angleLimit, DEFAULT_PARAMETERS.angleLimit), 8, 45),
        handleLength: clamp(toNumber(state.handleLength, DEFAULT_PARAMETERS.handleLength), 4.5, 11),
        jawLength: clamp(toNumber(state.jawLength, DEFAULT_PARAMETERS.jawLength), 1.2, 4.6),
        visualScale: clamp(toNumber(state.visualScale, DEFAULT_PARAMETERS.visualScale), 0.7, 1.6),
        friction: clamp(toNumber(state.friction, DEFAULT_PARAMETERS.friction), 0, 0.45),
        rigidity: clamp(toNumber(state.rigidity, DEFAULT_PARAMETERS.rigidity), 60, 100),
        mass: clamp(toNumber(state.mass, DEFAULT_PARAMETERS.mass), 0.5, 4),
        damping: clamp(toNumber(state.damping, DEFAULT_PARAMETERS.damping), 0.05, 0.9),
    };

    normalized.d1 = clamp(toNumber(state.d1, DEFAULT_PARAMETERS.d1), 1.5, normalized.handleLength - 0.45);
    normalized.d2 = clamp(toNumber(state.d2, DEFAULT_PARAMETERS.d2), 0.5, normalized.jawLength - 0.15);

    return normalized;
}

function computeResponse(inputs, activeInputForce) {
    const restAngle = Math.min(inputs.openAngle, inputs.angleLimit);
    const rigidityFactor = inputs.rigidity / 100;
    const massFactor = (inputs.mass - 0.5) / 3.5;
    const configuredForce = Math.max(inputs.inputForce, 0.001);
    const forceRatio = clamp(activeInputForce / configuredForce, 0, 1);
    const loadFactor = activeInputForce / 650;

    const closureRatio = clamp(
        loadFactor *
            (inputs.d1 / Math.max(inputs.handleLength, 0.001)) *
            (inputs.jawLength / Math.max(inputs.d2, 0.001)) *
            rigidityFactor *
            (1 - inputs.friction * 0.38) *
            1.85,
        0,
        1,
    );

    const minimumAngle = clamp(
        2.2 + inputs.friction * 5.2 + (1 - rigidityFactor) * 5.8,
        MINIMUM_CONTACT_ANGLE,
        Math.max(restAngle - 0.45, MINIMUM_CONTACT_ANGLE + 0.1),
    );

    const activeAngle = restAngle - (restAngle - minimumAngle) * closureRatio;
    const angleRatio = activeAngle / Math.max(inputs.angleLimit, 0.001);

    const lossFactor = clamp(
        inputs.friction * 0.52 +
            (1 - rigidityFactor) * 0.34 +
            inputs.damping * 0.11 +
            massFactor * 0.05 +
            angleRatio * 0.06 +
            (1 - forceRatio) * 0.03,
        0.02,
        0.7,
    );

    const efficiency = 1 - lossFactor;
    const torqueInput = activeInputForce * inputs.d1;
    const idealOutputForce = activeInputForce > 0 ? torqueInput / inputs.d2 : 0;
    const outputForce = idealOutputForce * efficiency;
    const torqueOutput = outputForce * inputs.d2;
    const torqueLoss = Math.max(0, torqueInput - torqueOutput);
    const residualRatio = torqueInput > 0 ? torqueLoss / torqueInput : 0;
    const actualMechanicalAdvantage = activeInputForce > 0 ? outputForce / activeInputForce : 0;

    const jawGap = Math.max(0.16, 2 * inputs.jawLength * Math.sin(degToRad(activeAngle) / 2));
    const handleSpan = Math.max(0.24, 2 * inputs.handleLength * Math.sin(degToRad(activeAngle) / 2));

    return {
        restAngle,
        activeAngle,
        minimumAngle,
        closureRatio,
        efficiency,
        torqueInput,
        torqueOutput,
        torqueLoss,
        residualRatio,
        idealOutputForce,
        outputForce,
        actualMechanicalAdvantage,
        jawGap,
        handleSpan,
    };
}

function buildForceGraph(inputs) {
    const points = [];
    const totalSamples = 24;

    for (let index = 0; index < totalSamples; index += 1) {
        const sampleInputForce = inputs.inputForce * (index / (totalSamples - 1));
        const response = computeResponse(inputs, sampleInputForce);

        points.push({
            inputForce: sampleInputForce,
            referenceForce: sampleInputForce,
            outputForce: response.outputForce,
        });
    }

    return points;
}

export function calculateSimulation(rawState = {}, runtime = {}) {
    const inputs = normalizeParameters(rawState);
    const forceProgress = clamp(Number(runtime.forceProgress ?? 0), 0, 1);
    const activeInputForce = inputs.inputForce * forceProgress;
    const activeResponse = computeResponse(inputs, activeInputForce);
    const configuredResponse = computeResponse(inputs, inputs.inputForce);

    const idealMechanicalAdvantage = inputs.d1 / inputs.d2;
    const inverseRatio = inputs.d2 / inputs.d1;
    const limitedByStop = inputs.openAngle > inputs.angleLimit;
    const graphSamples = buildForceGraph(inputs);
    const graphYMax = Math.max(
        inputs.inputForce,
        configuredResponse.outputForce,
        configuredResponse.idealOutputForce,
        50,
    ) * 1.12;

    let equilibriumLabel = "Desequilibrio apreciable";
    let equilibriumTone = "alert";

    if (forceProgress < 0.02) {
        equilibriumLabel = "Sistema en reposo";
        equilibriumTone = "good";
    } else if (limitedByStop) {
        equilibriumLabel = "Limitado por tope angular";
        equilibriumTone = "warn";
    } else if (activeResponse.residualRatio < 0.08) {
        equilibriumLabel = "Equilibrio casi ideal";
        equilibriumTone = "good";
    } else if (activeResponse.residualRatio < 0.18) {
        equilibriumLabel = "Equilibrio con pérdidas";
        equilibriumTone = "warn";
    }

    let advantageLabel = "Baja";
    if (activeResponse.actualMechanicalAdvantage >= 3) {
        advantageLabel = "Alta";
    } else if (activeResponse.actualMechanicalAdvantage >= 1.8) {
        advantageLabel = "Media";
    }

    const systemObservation =
        idealMechanicalAdvantage >= 2.2
            ? "Mayor d1 y menor d2 incrementan la fuerza en las mordazas."
            : "La geometría actual privilegia recorrido angular frente a multiplicación de fuerza.";

    const observations = [
        `La geometría actual entrega una ventaja mecánica ideal de ${idealMechanicalAdvantage.toFixed(2)}x y una efectiva máxima de ${configuredResponse.actualMechanicalAdvantage.toFixed(2)}x.`,
        forceProgress < 0.02
            ? `La pinza está en reposo. Al pulsar aplicar fuerza, la carga de ${inputs.inputForce.toFixed(1)} N se trasladará desde los mangos hacia las mordazas.`
            : `Con ${activeInputForce.toFixed(1)} N activos a ${inputs.d1.toFixed(2)} cm del fulcro, las mordazas desarrollan ${activeResponse.outputForce.toFixed(1)} N a ${inputs.d2.toFixed(2)} cm.`,
        limitedByStop
            ? `El ángulo inicial solicitado (${inputs.openAngle.toFixed(1)}°) supera el tope de ${inputs.angleLimit.toFixed(1)}°, así que la apertura de reposo queda recortada por la articulación.`
            : `La apertura pasa de ${Math.max(0.16, 2 * inputs.jawLength * Math.sin(degToRad(activeResponse.restAngle) / 2)).toFixed(2)} cm en reposo a ${activeResponse.jawGap.toFixed(2)} cm bajo carga.`,
        inputs.friction > 0.2 || inputs.rigidity < 82
            ? `Las pérdidas ya son visibles: la eficiencia máxima baja al ${(configuredResponse.efficiency * 100).toFixed(1)}%. Reducir fricción o aumentar rigidez acercará la pinza al caso ideal.`
            : `El sistema conserva hasta ${(configuredResponse.efficiency * 100).toFixed(1)}% del momento de entrada cuando la carga está completamente aplicada.`,
    ];

    return {
        inputs,
        load: {
            progress: forceProgress,
            isApplied: forceProgress > 0.02,
            stateLabel: forceProgress < 0.02 ? "En reposo" : forceProgress < 0.98 ? "Aplicando carga" : "Carga sostenida",
            activeInputForce,
        },
        ideal: {
            outputForce: configuredResponse.idealOutputForce,
            idealOutputForce: configuredResponse.idealOutputForce,
            mechanicalAdvantage: idealMechanicalAdvantage,
            inverseRatio,
        },
        actual: {
            outputForce: activeResponse.outputForce,
            mechanicalAdvantage: activeResponse.actualMechanicalAdvantage,
            torqueOutput: activeResponse.torqueOutput,
            efficiency: activeResponse.efficiency,
        },
        potential: {
            outputForce: configuredResponse.outputForce,
            torqueInput: configuredResponse.torqueInput,
            torqueOutput: configuredResponse.torqueOutput,
            mechanicalAdvantage: configuredResponse.actualMechanicalAdvantage,
            jawGap: configuredResponse.jawGap,
            effectiveOpenAngle: configuredResponse.activeAngle,
            efficiency: configuredResponse.efficiency,
        },
        moments: {
            torqueInput: activeResponse.torqueInput,
            torqueOutput: activeResponse.torqueOutput,
            torqueLoss: activeResponse.torqueLoss,
            residualRatio: activeResponse.residualRatio,
        },
        scene: {
            requestedOpenAngle: inputs.openAngle,
            effectiveOpenAngle: activeResponse.activeAngle,
            restOpenAngle: activeResponse.restAngle,
            jawGap: activeResponse.jawGap,
            handleSpan: activeResponse.handleSpan,
            restJawGap: Math.max(0.16, 2 * inputs.jawLength * Math.sin(degToRad(activeResponse.restAngle) / 2)),
            closureRatio: activeResponse.closureRatio,
            limitedByStop,
        },
        status: {
            equilibriumLabel,
            equilibriumTone,
            advantageLabel,
            systemObservation,
        },
        texts: {
            equation: forceProgress < 0.02
                ? `Carga preparada: si aplicas ${inputs.inputForce.toFixed(1)} N, el modelo ideal predice ${configuredResponse.idealOutputForce.toFixed(1)} N en las mordazas y el modelo efectivo ${configuredResponse.outputForce.toFixed(1)} N.`
                : `F_salida,ideal = (${activeInputForce.toFixed(1)} * ${inputs.d1.toFixed(2)}) / ${inputs.d2.toFixed(2)} = ${activeResponse.idealOutputForce.toFixed(1)} N; con eficiencia ${(activeResponse.efficiency * 100).toFixed(1)}%, la salida efectiva queda en ${activeResponse.outputForce.toFixed(1)} N.`,
            geometry: `VM ideal = d1 / d2 = ${inputs.d1.toFixed(2)} / ${inputs.d2.toFixed(2)} = ${idealMechanicalAdvantage.toFixed(2)}x. La razón inversa d2 / d1 es ${inverseRatio.toFixed(2)}.`,
        },
        graph: {
            xMax: Math.max(inputs.inputForce, 50),
            yMax: graphYMax,
            samples: graphSamples,
            activePoint: {
                inputForce: activeInputForce,
                outputForce: activeResponse.outputForce,
            },
            configuredPoint: {
                inputForce: inputs.inputForce,
                outputForce: configuredResponse.outputForce,
            },
        },
        observations,
    };
}
