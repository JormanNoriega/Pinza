const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);

    Object.entries(attributes).forEach(([key, value]) => {
        node.setAttribute(key, String(value));
    });

    return node;
}

function linePath(points) {
    return points
        .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
        .join(" ");
}

export function renderForceGraph(simulation) {
    const svg = document.getElementById("force-graph");
    if (!svg) {
        return;
    }

    const width = 920;
    const height = 340;
    const margin = { top: 26, right: 28, bottom: 52, left: 66 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const { graph } = simulation;

    const xScale = (value) => margin.left + (value / graph.xMax) * chartWidth;
    const yScale = (value) => height - margin.bottom - (value / graph.yMax) * chartHeight;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.replaceChildren();

    const background = createSvgElement("rect", {
        x: 0,
        y: 0,
        width,
        height,
        fill: "transparent",
    });
    svg.appendChild(background);

    const gridGroup = createSvgElement("g");
    const gridLines = 5;

    for (let index = 0; index <= gridLines; index += 1) {
        const forceValue = (graph.yMax / gridLines) * index;
        const y = yScale(forceValue);

        gridGroup.appendChild(
            createSvgElement("line", {
                x1: margin.left,
                y1: y,
                x2: width - margin.right,
                y2: y,
                stroke: "#d7e4e7",
                "stroke-width": 1,
            }),
        );

        const label = createSvgElement("text", {
            x: margin.left - 12,
            y: y + 4,
            fill: "#5d737c",
            "font-size": 12,
            "text-anchor": "end",
        });
        label.textContent = `${Math.round(forceValue)} N`;
        gridGroup.appendChild(label);
    }

    const verticalLines = 4;
    for (let index = 0; index <= verticalLines; index += 1) {
        const forceValue = (graph.xMax / verticalLines) * index;
        const x = xScale(forceValue);

        gridGroup.appendChild(
            createSvgElement("line", {
                x1: x,
                y1: margin.top,
                x2: x,
                y2: height - margin.bottom,
                stroke: "#ecf3f5",
                "stroke-width": 1,
            }),
        );

        const label = createSvgElement("text", {
            x,
            y: height - margin.bottom + 22,
            fill: "#5d737c",
            "font-size": 12,
            "text-anchor": "middle",
        });
        label.textContent = `${Math.round(forceValue)} N`;
        gridGroup.appendChild(label);
    }

    svg.appendChild(gridGroup);

    const axes = createSvgElement("g");
    axes.appendChild(
        createSvgElement("line", {
            x1: margin.left,
            y1: height - margin.bottom,
            x2: width - margin.right,
            y2: height - margin.bottom,
            stroke: "#204b63",
            "stroke-width": 1.5,
        }),
    );
    axes.appendChild(
        createSvgElement("line", {
            x1: margin.left,
            y1: margin.top,
            x2: margin.left,
            y2: height - margin.bottom,
            stroke: "#204b63",
            "stroke-width": 1.5,
        }),
    );
    svg.appendChild(axes);

    const inputPoints = graph.samples.map((sample) => [xScale(sample.inputForce), yScale(sample.referenceForce)]);
    const outputPoints = graph.samples.map((sample) => [xScale(sample.inputForce), yScale(sample.outputForce)]);

    svg.appendChild(
        createSvgElement("path", {
            d: linePath(inputPoints),
            fill: "none",
            stroke: "#5da5b3",
            "stroke-width": 3,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
        }),
    );

    svg.appendChild(
        createSvgElement("path", {
            d: linePath(outputPoints),
            fill: "none",
            stroke: "#d97706",
            "stroke-width": 4,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
        }),
    );

    const configuredX = xScale(graph.configuredPoint.inputForce);
    const configuredY = yScale(graph.configuredPoint.outputForce);
    svg.appendChild(
        createSvgElement("circle", {
            cx: configuredX,
            cy: configuredY,
            r: 7,
            fill: "#ffffff",
            stroke: "#d97706",
            "stroke-width": 3,
            opacity: 0.7,
        }),
    );

    const activeX = xScale(graph.activePoint.inputForce);
    const activeY = yScale(graph.activePoint.outputForce);
    svg.appendChild(
        createSvgElement("circle", {
            cx: activeX,
            cy: activeY,
            r: 8,
            fill: "#c65d46",
            stroke: "#ffffff",
            "stroke-width": 3,
        }),
    );

    const activeLabelGroup = createSvgElement("g");
    const labelWidth = 136;
    const labelHeight = 44;
    const labelX = Math.min(Math.max(activeX - labelWidth / 2, margin.left + 6), width - margin.right - labelWidth);
    const labelY = Math.max(activeY - 58, margin.top + 6);

    activeLabelGroup.appendChild(
        createSvgElement("rect", {
            x: labelX,
            y: labelY,
            rx: 14,
            ry: 14,
            width: labelWidth,
            height: labelHeight,
            fill: "rgba(255,255,255,0.95)",
            stroke: "#d8e3e6",
            "stroke-width": 1,
        }),
    );

    const topLine = createSvgElement("text", {
        x: labelX + 12,
        y: labelY + 18,
        fill: "#5d737c",
        "font-size": 12,
    });
    topLine.textContent = `Entrada ${graph.activePoint.inputForce.toFixed(1)} N`;

    const bottomLine = createSvgElement("text", {
        x: labelX + 12,
        y: labelY + 33,
        fill: "#16333d",
        "font-size": 13,
        "font-weight": 700,
    });
    bottomLine.textContent = `Salida ${graph.activePoint.outputForce.toFixed(1)} N`;

    activeLabelGroup.append(topLine, bottomLine);
    svg.appendChild(activeLabelGroup);

    const xAxisLabel = createSvgElement("text", {
        x: width - margin.right,
        y: height - 12,
        fill: "#204b63",
        "font-size": 12,
        "text-anchor": "end",
    });
    xAxisLabel.textContent = "Fuerza de entrada aplicada";
    svg.appendChild(xAxisLabel);

    const yAxisLabel = createSvgElement("text", {
        x: 18,
        y: margin.top,
        fill: "#204b63",
        "font-size": 12,
    });
    yAxisLabel.textContent = "Fuerza transmitida";
    svg.appendChild(yAxisLabel);
}
