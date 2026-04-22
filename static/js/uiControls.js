function resolveBound(bound, state) {
    return typeof bound === "function" ? bound(state) : bound;
}

function formatValue(value, decimals = 0) {
    return Number(value).toFixed(decimals);
}

function metricElement(id) {
    return document.getElementById(id);
}

function setTone(card, tone) {
    if (!card) {
        return;
    }

    card.classList.remove("tone-good", "tone-warn", "tone-alert");
    card.classList.add(`tone-${tone}`);
}

export function createControlPanel({ container, sections, initialState, onParameterChange }) {
    const controls = new Map();

    container.replaceChildren();

    sections.forEach((section) => {
        const sectionEl = document.createElement("section");
        sectionEl.className = "control-section";

        const heading = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = section.title;
        const description = document.createElement("p");
        description.textContent = section.description;

        heading.append(title, description);
        sectionEl.appendChild(heading);

        section.fields.forEach((field) => {
            const card = document.createElement("article");
            card.className = "control-card";

            const header = document.createElement("div");
            header.className = "control-card-header";

            const textBlock = document.createElement("div");
            const label = document.createElement("label");
            label.htmlFor = `input-${field.key}`;
            label.textContent = field.label;
            const hint = document.createElement("small");
            hint.textContent = field.hint;
            textBlock.append(label, hint);

            const readout = document.createElement("span");
            readout.className = "control-readout";

            header.append(textBlock, readout);

            const inputsWrap = document.createElement("div");
            inputsWrap.className = "control-inputs";

            const range = document.createElement("input");
            range.type = "range";
            range.id = `input-${field.key}`;
            range.step = String(field.step);

            const number = document.createElement("input");
            number.type = "number";
            number.step = String(field.step);

            const emit = (value) => onParameterChange(field.key, Number(value));
            range.addEventListener("input", (event) => emit(event.target.value));
            number.addEventListener("change", (event) => emit(event.target.value));
            number.addEventListener("blur", (event) => emit(event.target.value));

            inputsWrap.append(range, number);
            card.append(header, inputsWrap);
            sectionEl.appendChild(card);

            controls.set(field.key, { field, range, number, readout });
        });

        container.appendChild(sectionEl);
    });

    function setValues(state) {
        controls.forEach(({ field, range, number, readout }) => {
            const min = resolveBound(field.min, state);
            const max = resolveBound(field.max, state);
            const value = Math.min(max, Math.max(min, Number(state[field.key])));

            range.min = String(min);
            range.max = String(max);
            range.value = String(value);

            number.min = String(min);
            number.max = String(max);
            number.value = formatValue(value, field.decimals);

            readout.textContent = `${formatValue(value, field.decimals)}${field.unit ? ` ${field.unit}` : ""}`;
        });
    }

    setValues(initialState);
    return { setValues };
}

export function setupActionButtons({ onReset, onFocus, onToggleAxes, onApplyForce, onReleaseForce }) {
    metricElement("reset-button")?.addEventListener("click", onReset);
    metricElement("focus-button")?.addEventListener("click", onFocus);
    metricElement("toggle-axes-button")?.addEventListener("click", onToggleAxes);
    metricElement("apply-force-button")?.addEventListener("click", onApplyForce);
    metricElement("release-force-button")?.addEventListener("click", onReleaseForce);
}

export function updateDashboard(simulation) {
    const { inputs, load, actual, ideal, moments, potential, scene, status, texts, observations } = simulation;

    metricElement("metric-input-force").textContent = `${load.activeInputForce.toFixed(1)} N`;
    metricElement("metric-output-force").textContent = `${actual.outputForce.toFixed(1)} N`;
    metricElement("metric-d1").textContent = `${inputs.d1.toFixed(2)} cm`;
    metricElement("metric-d2").textContent = `${inputs.d2.toFixed(2)} cm`;
    metricElement("metric-torque-input").textContent = `${moments.torqueInput.toFixed(1)} N*cm`;
    metricElement("metric-torque-output").textContent = `${moments.torqueOutput.toFixed(1)} N*cm`;
    metricElement("metric-mechanical-advantage").textContent = `${ideal.mechanicalAdvantage.toFixed(2)}x`;
    metricElement("metric-jaw-gap").textContent = `${scene.jawGap.toFixed(2)} cm`;

    metricElement("status-equilibrium").textContent = status.equilibriumLabel;
    metricElement("status-advantage").textContent = status.advantageLabel;
    metricElement("status-efficiency").textContent = `${actual.reactionForce.toFixed(1)} N`;
    metricElement("status-observation").textContent = status.systemObservation;

    setTone(metricElement("status-equilibrium").closest(".status-card"), status.equilibriumTone);
    setTone(metricElement("status-advantage").closest(".status-card"), ideal.mechanicalAdvantage >= 1.8 ? "good" : "warn");
    setTone(metricElement("status-efficiency").closest(".status-card"), load.isApplied ? "good" : "warn");
    setTone(metricElement("status-observation").closest(".status-card"), load.isApplied ? "good" : "warn");

    metricElement("badge-ma").textContent = `${ideal.mechanicalAdvantage.toFixed(2)}x`;
    metricElement("badge-efficiency").textContent = `${actual.reactionForce.toFixed(1)} N`;
    metricElement("badge-gap").textContent = `${scene.jawGap.toFixed(2)} cm`;
    metricElement("badge-state").textContent = status.equilibriumLabel;

    metricElement("configured-force-chip").textContent = `Carga configurada: ${inputs.inputForce.toFixed(1)} N`;
    metricElement("force-duration-readout").textContent = `${load.durationSeconds.toFixed(1)} s`;
    metricElement("load-state-copy").textContent = load.isRunning
        ? `La fuerza se está aplicando de forma progresiva. Tiempo transcurrido: ${load.elapsedSeconds.toFixed(2)} s de ${load.durationSeconds.toFixed(1)} s; entrada ${load.activeInputForce.toFixed(1)} N y salida ${actual.outputForce.toFixed(1)} N.`
        : load.stateLabel === "Evento completado"
            ? `El evento ya terminó. La gráfica conserva el historial temporal de entrada y salida para que puedas analizar la respuesta antes de lanzar otro ensayo.`
            : `La pinza está en reposo. Ajusta la fuerza de entrada, define el tiempo de aplicación y pulsa Aplicar fuerza para registrar el evento.`;

    metricElement("graph-configured-input").textContent = `${inputs.inputForce.toFixed(1)} N`;
    metricElement("graph-active-input").textContent = `${load.activeInputForce.toFixed(1)} N`;
    metricElement("graph-active-output").textContent = `${actual.outputForce.toFixed(1)} N`;
    metricElement("graph-duration").textContent = `${load.durationSeconds.toFixed(1)} s`;
    metricElement("graph-configured-output").textContent = `${potential.outputForce.toFixed(1)} N`;
    metricElement("graph-caption").textContent = load.isRunning
        ? `La gráfica temporal registra cuadro a cuadro cómo suben y bajan la fuerza de entrada y la fuerza de salida durante el evento.`
        : load.stateLabel === "Evento completado"
            ? `La gráfica conserva el evento completo de ${load.durationSeconds.toFixed(1)} s. El punto rojo queda en el último instante registrado y puedes reiniciar o lanzar una nueva aplicación.`
            : `La gráfica quedará afectada durante ${load.durationSeconds.toFixed(1)} s cuando pulses Aplicar fuerza, registrando la evolución temporal del evento.`;

    const applyButton = metricElement("apply-force-button");
    const releaseButton = metricElement("release-force-button");
    if (applyButton) {
        applyButton.disabled = load.isRunning;
    }
    if (releaseButton) {
        releaseButton.disabled = !load.isRunning && load.elapsedSeconds < 0.001 && !load.isApplied;
    }

    metricElement("equation-live").textContent = texts.equation;
    metricElement("geometry-live").textContent = texts.geometry;

    const observationsList = metricElement("observations-list");
    observationsList.replaceChildren();
    observations.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        observationsList.appendChild(li);
    });
}
