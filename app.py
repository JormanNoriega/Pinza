from __future__ import annotations

from math import radians, sin
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)


DEFAULT_PARAMETERS: dict[str, float] = {
    "inputForce": 180.0,
    "d1": 6.2,
    "d2": 1.8,
    "openAngle": 18.0,
    "angleLimit": 32.0,
    "handleLength": 7.4,
    "jawLength": 2.6,
    "handleLengthBase": 7.4,
    "jawLengthBase": 2.6,
    "pivotOffset": 0.0,
    "visualScale": 1.0,
    "friction": 0.08,
    "rigidity": 90.0,
    "mass": 1.2,
    "damping": 0.35,
}


RANGES: dict[str, tuple[float, float]] = {
    "inputForce": (20.0, 650.0),
    "openAngle": (4.0, 42.0),
    "angleLimit": (8.0, 45.0),
    "handleLength": (4.5, 11.0),
    "jawLength": (1.2, 4.6),
    "visualScale": (0.7, 1.6),
    "friction": (0.0, 0.45),
    "rigidity": (60.0, 100.0),
    "mass": (0.5, 4.0),
    "damping": (0.05, 0.9),
}


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def to_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def pivot_offset_bounds(handle_length: float, jaw_length: float) -> tuple[float, float]:
    return (
        max(RANGES["handleLength"][0] - handle_length, jaw_length - RANGES["jawLength"][1]),
        min(RANGES["handleLength"][1] - handle_length, jaw_length - RANGES["jawLength"][0]),
    )


def get_base_lengths(params: dict[str, Any]) -> tuple[float, float]:
    return (
        clamp(to_float(params.get("handleLengthBase"), params.get("handleLength", DEFAULT_PARAMETERS["handleLength"])), *RANGES["handleLength"]),
        clamp(to_float(params.get("jawLengthBase"), params.get("jawLength", DEFAULT_PARAMETERS["jawLength"])), *RANGES["jawLength"]),
    )


def resolve_geometry(params: dict[str, float]) -> dict[str, float]:
    handle_length_base, jaw_length_base = get_base_lengths(params)
    lower, upper = pivot_offset_bounds(handle_length_base, jaw_length_base)
    pivot_offset = clamp(to_float(params.get("pivotOffset"), DEFAULT_PARAMETERS["pivotOffset"]), lower, upper)
    return {
        "handleLengthBase": handle_length_base,
        "jawLengthBase": jaw_length_base,
        "pivotOffset": pivot_offset,
        "handleLength": handle_length_base + pivot_offset,
        "jawLength": jaw_length_base - pivot_offset,
        "totalLength": handle_length_base + jaw_length_base,
    }


def normalize_params(payload: dict[str, Any] | None = None) -> dict[str, float]:
    source = {**DEFAULT_PARAMETERS, **(payload or {})}

    params = {
        key: clamp(to_float(source.get(key), default), *RANGES[key])
        if key in RANGES
        else to_float(source.get(key), default)
        for key, default in DEFAULT_PARAMETERS.items()
    }

    geometry = resolve_geometry(params)
    params["handleLength"] = geometry["handleLength"]
    params["jawLength"] = geometry["jawLength"]
    params["handleLengthBase"] = geometry["handleLengthBase"]
    params["jawLengthBase"] = geometry["jawLengthBase"]
    params["pivotOffset"] = geometry["pivotOffset"]
    params["d1"] = clamp(to_float(source.get("d1"), DEFAULT_PARAMETERS["d1"]), 1.5, geometry["handleLength"] - 0.45)
    params["d2"] = clamp(to_float(source.get("d2"), DEFAULT_PARAMETERS["d2"]), 0.5, geometry["jawLength"] - 0.15)
    return params


def compute_simulation(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    inputs = normalize_params(payload)
    geometry = resolve_geometry(inputs)

    torque_input = inputs["inputForce"] * inputs["d1"]
    ideal_output_force = torque_input / inputs["d2"]
    ideal_mechanical_advantage = inputs["d1"] / inputs["d2"]
    inverse_ratio = inputs["d2"] / inputs["d1"]

    effective_open_angle = min(inputs["openAngle"], inputs["angleLimit"])
    limited_by_stop = inputs["openAngle"] > inputs["angleLimit"]
    angle_ratio = effective_open_angle / max(inputs["angleLimit"], 0.001)
    rigidity_factor = inputs["rigidity"] / 100.0
    mass_factor = (inputs["mass"] - RANGES["mass"][0]) / (RANGES["mass"][1] - RANGES["mass"][0])

    loss_factor = (
        inputs["friction"] * 0.52
        + (1.0 - rigidity_factor) * 0.34
        + inputs["damping"] * 0.11
        + mass_factor * 0.05
        + angle_ratio * 0.06
    )
    loss_factor = clamp(loss_factor, 0.02, 0.70)

    efficiency = 1.0 - loss_factor
    output_force = ideal_output_force * efficiency
    torque_output = output_force * inputs["d2"]
    torque_loss = max(0.0, torque_input - torque_output)
    residual_ratio = torque_loss / torque_input if torque_input else 0.0
    actual_mechanical_advantage = output_force / inputs["inputForce"] if inputs["inputForce"] else 0.0

    jaw_gap = max(0.16, 2.0 * geometry["jawLength"] * sin(radians(effective_open_angle) / 2.0))
    handle_span = max(0.24, 2.0 * geometry["handleLength"] * sin(radians(effective_open_angle) / 2.0))

    if limited_by_stop:
        equilibrium_label = "Limitado por tope angular"
        equilibrium_tone = "warn"
    elif residual_ratio < 0.08:
        equilibrium_label = "Equilibrio casi ideal"
        equilibrium_tone = "good"
    elif residual_ratio < 0.18:
        equilibrium_label = "Equilibrio con perdidas"
        equilibrium_tone = "warn"
    else:
        equilibrium_label = "Desequilibrio apreciable"
        equilibrium_tone = "alert"

    if actual_mechanical_advantage >= 3.0:
        advantage_label = "Alta"
    elif actual_mechanical_advantage >= 1.8:
        advantage_label = "Media"
    else:
        advantage_label = "Baja"

    observations = [
        (
            f"La geometria entrega una ventaja mecanica efectiva de {actual_mechanical_advantage:.2f}x "
            f"y una ideal de {ideal_mechanical_advantage:.2f}x cuando no hay perdidas."
        ),
        (
            f"Con {inputs['inputForce']:.1f} N aplicados a {inputs['d1']:.2f} cm del fulcro, "
            f"las mordazas alcanzan {output_force:.1f} N a {inputs['d2']:.2f} cm."
        ),
        (
            f"La apertura efectiva es de {jaw_gap:.2f} cm con un angulo operativo de {effective_open_angle:.1f} grados."
            if not limited_by_stop
            else f"El angulo solicitado supera el tope de {inputs['angleLimit']:.1f} grados y la pinza queda mecanicamente limitada."
        ),
        (
            "El pivote permanece centrado y las longitudes efectivas coinciden con la geometria de referencia."
            if abs(geometry["pivotOffset"]) < 0.01
            else (
                f"El pivote se desplazo {geometry['pivotOffset']:.2f} cm hacia las mordazas; "
                f"el brazo util del mango queda en {geometry['handleLength']:.2f} cm y el de la mordaza en {geometry['jawLength']:.2f} cm."
                if geometry["pivotOffset"] > 0
                else f"El pivote se desplazo {abs(geometry['pivotOffset']):.2f} cm hacia los mangos; "
                f"el brazo util del mango queda en {geometry['handleLength']:.2f} cm y el de la mordaza en {geometry['jawLength']:.2f} cm."
            )
        ),
        (
            f"La eficiencia estimada es del {efficiency * 100.0:.1f}%; reducir friccion o aumentar rigidez acerca el sistema al equilibrio ideal."
            if inputs["friction"] > 0.20 or inputs["rigidity"] < 82.0
            else f"Las perdidas son moderadas: el sistema conserva el {efficiency * 100.0:.1f}% del momento de entrada."
        ),
    ]

    system_observation = (
        "Mayor d1 y menor d2 incrementan la fuerza en las mordazas."
        if ideal_mechanical_advantage >= 2.2
        else "La pinza esta privilegiando recorrido angular sobre amplificacion de fuerza."
    )

    return {
        "inputs": inputs,
        "ideal": {
            "outputForce": round(ideal_output_force, 4),
            "idealOutputForce": round(ideal_output_force, 4),
            "mechanicalAdvantage": round(ideal_mechanical_advantage, 4),
            "inverseRatio": round(inverse_ratio, 4),
        },
        "actual": {
            "outputForce": round(output_force, 4),
            "mechanicalAdvantage": round(actual_mechanical_advantage, 4),
            "torqueOutput": round(torque_output, 4),
            "efficiency": round(efficiency, 4),
        },
        "moments": {
            "torqueInput": round(torque_input, 4),
            "torqueOutput": round(torque_output, 4),
            "torqueLoss": round(torque_loss, 4),
            "residualRatio": round(residual_ratio, 4),
        },
        "scene": {
            "requestedOpenAngle": round(inputs["openAngle"], 4),
            "effectiveOpenAngle": round(effective_open_angle, 4),
            "jawGap": round(jaw_gap, 4),
            "handleSpan": round(handle_span, 4),
            "pivotOffset": round(geometry["pivotOffset"], 4),
            "limitedByStop": limited_by_stop,
        },
        "geometry": {
            "pivotOffset": round(geometry["pivotOffset"], 4),
            "handleLength": round(geometry["handleLength"], 4),
            "jawLength": round(geometry["jawLength"], 4),
            "totalLength": round(geometry["totalLength"], 4),
        },
        "status": {
            "equilibriumLabel": equilibrium_label,
            "equilibriumTone": equilibrium_tone,
            "advantageLabel": advantage_label,
            "systemObservation": system_observation,
        },
        "texts": {
            "equation": (
                f"F_salida,ideal = ({inputs['inputForce']:.1f} * {inputs['d1']:.2f}) / {inputs['d2']:.2f} "
                f"= {ideal_output_force:.1f} N; con eficiencia {efficiency * 100.0:.1f}%, la salida efectiva queda en {output_force:.1f} N."
            ),
            "geometry": (
                f"VM ideal = d1 / d2 = {inputs['d1']:.2f} / {inputs['d2']:.2f} = {ideal_mechanical_advantage:.2f}x. "
                f"El pivote esta en {geometry['pivotOffset']:.2f} cm y deja {geometry['handleLength']:.2f} cm hacia el mango "
                f"y {geometry['jawLength']:.2f} cm hacia la mordaza."
            ),
        },
        "observations": observations,
    }


@app.route("/")
def index() -> str:
    return render_template("index.html", defaults=DEFAULT_PARAMETERS)


@app.route("/api/model", methods=["GET", "POST"])
def model_endpoint():
    payload = request.get_json(silent=True) if request.method == "POST" else request.args.to_dict()
    return jsonify(compute_simulation(payload))


if __name__ == "__main__":
    app.run(debug=True)
