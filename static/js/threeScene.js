import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const DEG_TO_RAD = Math.PI / 180;

function disposeGroup(group) {
    group.traverse((child) => {
        if (child.geometry) {
            child.geometry.dispose();
        }

        if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
        } else if (child.material) {
            child.material.dispose();
        }
    });
}

function createRoundedBar(length, thickness, depth, material) {
    const geometry = new THREE.BoxGeometry(length, thickness, depth, 2, 2, 2);
    geometry.translate(-length / 2, 0, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function createJawSegment(length, thickness, depth, sign, material) {
    const group = new THREE.Group();

    const baseGeometry = new THREE.BoxGeometry(length * 0.7, thickness, depth);
    baseGeometry.translate(length * 0.35, sign * thickness * 0.4, 0);
    const base = new THREE.Mesh(baseGeometry, material);
    base.castShadow = true;
    base.receiveShadow = true;

    const tipGeometry = new THREE.BoxGeometry(length * 0.36, thickness * 0.68, depth * 0.82);
    tipGeometry.translate(length * 0.18, sign * thickness * 0.12, 0);
    const tip = new THREE.Mesh(tipGeometry, material);
    tip.castShadow = true;
    tip.receiveShadow = true;
    tip.position.set(length * 0.68, sign * thickness * 0.03, 0);
    tip.rotation.z = -sign * 0.22;

    group.add(base, tip);
    return group;
}

export class PliersScene {
    constructor(container) {
        this.container = container;
        this.axesVisible = true;
        this.motion = {
            currentAngle: 0,
            targetAngle: 0,
        };
        this.currentInputs = null;
        this.geometrySignature = "";

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xe5eef1, 18, 34);

        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
        this.camera.position.set(11, 7.5, 12.5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 620);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = false;
        this.controls.target.set(0.4, 0.2, 0);
        this.controls.maxDistance = 26;
        this.controls.minDistance = 6;
        this.controls.minPolarAngle = 0.4;
        this.controls.maxPolarAngle = 1.45;

        container.replaceChildren(this.renderer.domElement);

        this.setupEnvironment();
        this.setupMachine();
        this.attachResizeObserver();

        this.clock = new THREE.Clock();
        this.animate = this.animate.bind(this);
        this.renderer.setAnimationLoop(this.animate);
    }

    setupEnvironment() {
        const ambient = new THREE.HemisphereLight(0xffffff, 0xb0c7cc, 1.1);
        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
        keyLight.position.set(9, 14, 8);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.camera.left = -12;
        keyLight.shadow.camera.right = 12;
        keyLight.shadow.camera.top = 12;
        keyLight.shadow.camera.bottom = -12;
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x9cc7ce, 0.75);
        fillLight.position.set(-8, 5, -10);
        this.scene.add(fillLight);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(38, 38),
            new THREE.ShadowMaterial({ color: 0x7aa2aa, opacity: 0.16 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -4.1;
        floor.receiveShadow = true;
        this.scene.add(floor);

        const basePlate = new THREE.Mesh(
            new THREE.CircleGeometry(5.8, 72),
            new THREE.MeshStandardMaterial({
                color: 0xe3ecee,
                metalness: 0.05,
                roughness: 0.82,
            }),
        );
        basePlate.rotation.x = -Math.PI / 2;
        basePlate.position.y = -3.95;
        basePlate.receiveShadow = true;
        this.scene.add(basePlate);

        this.grid = new THREE.GridHelper(20, 20, 0x5d7b84, 0xb8ced3);
        this.grid.position.y = -3.9;
        this.grid.material.opacity = 0.33;
        this.grid.material.transparent = true;
        this.scene.add(this.grid);

        this.axes = new THREE.AxesHelper(4.5);
        this.axes.position.set(-5.4, -3.85, -5.4);
        this.scene.add(this.axes);
    }

    setupMachine() {
        this.machineRoot = new THREE.Group();
        this.machineRoot.position.set(0, 0.8, 0);
        this.machineRoot.rotation.x = -0.3;
        this.machineRoot.rotation.y = 0.25;
        this.scene.add(this.machineRoot);

        this.upperPivot = new THREE.Group();
        this.lowerPivot = new THREE.Group();

        this.upperGeometry = new THREE.Group();
        this.lowerGeometry = new THREE.Group();
        this.upperAnnotations = new THREE.Group();
        this.lowerAnnotations = new THREE.Group();

        this.upperPivot.add(this.upperGeometry, this.upperAnnotations);
        this.lowerPivot.add(this.lowerGeometry, this.lowerAnnotations);
        this.machineRoot.add(this.upperPivot, this.lowerPivot);

        const pivotMaterial = new THREE.MeshStandardMaterial({
            color: 0x264653,
            metalness: 0.78,
            roughness: 0.28,
        });

        const pivotRing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.38, 48), pivotMaterial);
        pivotRing.rotation.x = Math.PI / 2;
        pivotRing.castShadow = true;
        pivotRing.receiveShadow = true;

        const pivotCore = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.52, 40),
            new THREE.MeshStandardMaterial({
                color: 0xd0d8da,
                metalness: 0.95,
                roughness: 0.18,
            }),
        );
        pivotCore.rotation.x = Math.PI / 2;
        pivotCore.castShadow = true;
        pivotCore.receiveShadow = true;

        this.machineRoot.add(pivotRing, pivotCore);
    }

    rebuildLevers(inputs) {
        disposeGroup(this.upperGeometry);
        disposeGroup(this.lowerGeometry);
        disposeGroup(this.upperAnnotations);
        disposeGroup(this.lowerAnnotations);
        this.upperGeometry.clear();
        this.lowerGeometry.clear();
        this.upperAnnotations.clear();
        this.lowerAnnotations.clear();

        const scale = inputs.visualScale;
        const handleLength = inputs.handleLength * scale;
        const jawLength = inputs.jawLength * scale;
        const handleThickness = 0.48 * scale;
        const handleDepth = 0.44 * scale;
        const gripLength = handleLength * 0.56;
        const jawThickness = 0.24 * scale;
        const jawDepth = 0.34 * scale;

        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x96a9af,
            metalness: 0.84,
            roughness: 0.22,
        });
        const gripMaterial = new THREE.MeshStandardMaterial({
            color: 0x0f766e,
            metalness: 0.18,
            roughness: 0.68,
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: 0xd97706,
            metalness: 0.18,
            roughness: 0.52,
        });

        const buildLever = (targetGroup, annotationGroup, sign) => {
            const lever = new THREE.Group();

            const neck = createRoundedBar(handleLength, handleThickness, handleDepth, metalMaterial);
            neck.position.y = sign * 0.08 * scale;
            lever.add(neck);

            const gripGeometry = new THREE.BoxGeometry(gripLength, handleThickness * 1.18, handleDepth * 1.1);
            gripGeometry.translate(-(handleLength - gripLength / 2), 0, 0);
            const grip = new THREE.Mesh(gripGeometry, gripMaterial);
            grip.position.y = sign * 0.08 * scale;
            grip.castShadow = true;
            grip.receiveShadow = true;
            lever.add(grip);

            const jaw = createJawSegment(jawLength, jawThickness, jawDepth, sign, metalMaterial);
            lever.add(jaw);

            const cuttingInsert = new THREE.Mesh(
                new THREE.BoxGeometry(jawLength * 0.35, jawThickness * 0.32, jawDepth * 0.92),
                accentMaterial,
            );
            cuttingInsert.position.set(jawLength * 0.34, sign * 0.1 * scale, 0);
            cuttingInsert.rotation.z = -sign * 0.08;
            cuttingInsert.castShadow = true;
            lever.add(cuttingInsert);

            targetGroup.add(lever);

            const inputArrow = new THREE.ArrowHelper(
                new THREE.Vector3(0, -sign, 0),
                new THREE.Vector3(-inputs.d1 * scale, sign * 0.72 * scale, 0),
                1,
                0x0f766e,
                0.32,
                0.16,
            );
            const outputArrow = new THREE.ArrowHelper(
                new THREE.Vector3(0, -sign, 0),
                new THREE.Vector3(jawLength * 0.98, sign * 0.18 * scale, 0),
                1,
                0xd97706,
                0.28,
                0.14,
            );

            annotationGroup.add(inputArrow, outputArrow);

            if (sign > 0) {
                this.upperInputArrow = inputArrow;
                this.upperOutputArrow = outputArrow;

                const d1Line = new THREE.Line(
                    new THREE.BufferGeometry(),
                    new THREE.LineBasicMaterial({ color: 0xc65d46 }),
                );
                const d2Line = new THREE.Line(
                    new THREE.BufferGeometry(),
                    new THREE.LineBasicMaterial({ color: 0xc65d46 }),
                );
                const d1Marker = new THREE.Mesh(
                    new THREE.SphereGeometry(0.08 * scale, 16, 16),
                    new THREE.MeshStandardMaterial({ color: 0xc65d46, metalness: 0.1, roughness: 0.4 }),
                );
                const d2Marker = new THREE.Mesh(
                    new THREE.SphereGeometry(0.08 * scale, 16, 16),
                    new THREE.MeshStandardMaterial({ color: 0xc65d46, metalness: 0.1, roughness: 0.4 }),
                );
                annotationGroup.add(d1Line, d2Line, d1Marker, d2Marker);
                this.d1Line = d1Line;
                this.d2Line = d2Line;
                this.d1Marker = d1Marker;
                this.d2Marker = d2Marker;
            } else {
                this.lowerInputArrow = inputArrow;
                this.lowerOutputArrow = outputArrow;
            }
        };

        buildLever(this.upperGeometry, this.upperAnnotations, 1);
        buildLever(this.lowerGeometry, this.lowerAnnotations, -1);

        this.updateAnnotations(inputs, {
            actualForce: 0,
            outputForce: 0,
        });
    }

    updateAnnotations(inputs, forces) {
        const scale = inputs.visualScale;
        const d1 = inputs.d1 * scale;
        const d2 = inputs.d2 * scale;

        const updateArrowPair = (inputArrow, outputArrow, sign) => {
            if (!inputArrow || !outputArrow) {
                return;
            }

            const hasInputForce = forces.actualForce > 0.01;
            const hasOutputForce = forces.outputForce > 0.01;

            inputArrow.visible = hasInputForce;
            outputArrow.visible = hasOutputForce;

            if (hasInputForce) {
                const inputLength = THREE.MathUtils.clamp(0.55 + forces.actualForce / 220, 0.55, 3.4);
                inputArrow.position.set(-d1, sign * 1.12 * scale, 0);
                inputArrow.setLength(inputLength, 0.24, 0.14);
            }

            if (hasOutputForce) {
                const outputLength = THREE.MathUtils.clamp(0.6 + forces.outputForce / 280, 0.6, 4.8);
                outputArrow.position.set(d2, sign * 0.72 * scale, 0);
                outputArrow.setLength(outputLength, 0.24, 0.14);
            }
        };

        updateArrowPair(this.upperInputArrow, this.upperOutputArrow, 1);
        updateArrowPair(this.lowerInputArrow, this.lowerOutputArrow, -1);

        if (this.d1Line && this.d2Line) {
            this.d1Line.geometry.setFromPoints([
                new THREE.Vector3(0, 0.95 * scale, 0),
                new THREE.Vector3(-d1, 0.95 * scale, 0),
            ]);
            this.d2Line.geometry.setFromPoints([
                new THREE.Vector3(0, 0.52 * scale, 0),
                new THREE.Vector3(d2, 0.52 * scale, 0),
            ]);
            this.d1Marker.position.set(-d1, 0.95 * scale, 0);
            this.d2Marker.position.set(d2, 0.52 * scale, 0);
        }
    }

    update(simulation) {
        const { inputs, load, actual, scene } = simulation;
        this.currentInputs = inputs;

        const signature = [inputs.handleLength, inputs.jawLength, inputs.visualScale].map((value) => value.toFixed(3)).join("|");
        if (signature !== this.geometrySignature) {
            this.rebuildLevers(inputs);
            this.geometrySignature = signature;
        }

        this.updateAnnotations(inputs, {
            actualForce: load.activeInputForce,
            outputForce: actual.outputForce,
        });

        this.motion.targetAngle = scene.effectiveOpenAngle * DEG_TO_RAD;
    }

    focus() {
        this.camera.position.set(11, 7.5, 12.5);
        this.controls.target.set(0.4, 0.2, 0);
        this.controls.update();
    }

    toggleAxes() {
        this.axesVisible = !this.axesVisible;
        this.axes.visible = this.axesVisible;
        this.grid.visible = this.axesVisible;
    }

    attachResizeObserver() {
        const resize = () => {
            const width = this.container.clientWidth || 800;
            const height = this.container.clientHeight || 620;
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        };

        resize();

        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(resize);
            this.resizeObserver.observe(this.container);
        } else {
            window.addEventListener("resize", resize);
        }
    }

    animate() {
        this.clock.getDelta();
        this.motion.currentAngle = this.motion.targetAngle;

        const halfAngle = this.motion.currentAngle * 0.5;
        this.upperPivot.rotation.z = halfAngle;
        this.lowerPivot.rotation.z = -halfAngle;

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
