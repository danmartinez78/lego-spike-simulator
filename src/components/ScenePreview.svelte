<script lang="ts">
    import { boundaryStore } from '$lib/spike/scene';
    import { onDestroy, onMount } from 'svelte';
    import { WebGL, type MapTexture } from '$lib/ldraw/gl';
    import { brickColour, type Quad } from '$lib/ldraw/components';
    import { type SceneStore, type SceneObject } from '$lib/spike/scene';
    import * as m4 from '$lib/ldraw/m4';
    import { showFps } from '$lib/debug';

    export let id: string;
    export let scene: SceneStore;
    export let enabled = true;
    export let select: string | undefined = undefined;
    export let camera: 'top' | 'left' | 'right' | 'front' | 'back' | 'adaptive';
    export let robotFocus = false;
    export let tilt = true;
    export let rotate = false;
    export let unresolved: string[] = [];
    export let dimMap = false;
    // Let the viewer drag to orbit, right-drag, shift-drag or two-finger drag
    // to pan, scroll or pinch to zoom, and double-click to reset.
    export let interactive = false;

    let canRender = false;
    let gl: WebGL | undefined;
    let _droppedFrames = 0;
    let lastFrame: number = 0;
    let angle = 0;
    let mapTexture: MapTexture | null = null;
    let brown = brickColour('86');
    let red = brickColour('4');
    // The viewer's own camera moves, on top of the chosen camera.
    let orbitYaw = 0;
    let orbitPitch = 0;
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    $: viewChanged = orbitYaw != 0 || orbitPitch != 0 || zoom != 1 || panX != 0 || panY != 0;

    function resetView() {
        orbitYaw = 0;
        orbitPitch = 0;
        zoom = 1;
        panX = 0;
        panY = 0;
    }

    function zoomBy(factor: number) {
        zoom = Math.min(4, Math.max(0.1, zoom * factor));
    }

    function pointerDown(event: PointerEvent) {
        if (!interactive) {
            return;
        }
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        pinchDistance = currentPinchDistance();
    }

    function pointerUp(event: PointerEvent) {
        pointers.delete(event.pointerId);
        pinchDistance = currentPinchDistance();
    }

    function currentPinchDistance() {
        if (pointers.size != 2) {
            return 0;
        }
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function pointerMove(event: PointerEvent) {
        const last = pointers.get(event.pointerId);
        if (!interactive || !last) {
            return;
        }
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const canvas = event.currentTarget as HTMLElement;
        if (pointers.size == 2) {
            // Two fingers: pinch to zoom, and drag to pan. One finger moving
            // moves the midpoint between them by half as much.
            const distance = currentPinchDistance();
            if (pinchDistance > 0 && distance > 0) {
                zoomBy(pinchDistance / distance);
            }
            pinchDistance = distance;
            pan(canvas, dx / 2, dy / 2);
            return;
        }
        if (event.shiftKey || (event.buttons & 2) != 0) {
            pan(canvas, dx, dy);
        } else {
            orbitYaw += dx * 0.4;
            orbitPitch = Math.min(60, Math.max(-45, orbitPitch + dy * 0.3));
        }
    }

    // Pan by the same fraction of the view as the pointer moved.
    function pan(canvas: HTMLElement, dx: number, dy: number) {
        const height = Math.max(1, canvas.clientHeight);
        const viewHeight = 2 * (robotFocus ? 3 : 30) * zoom * Math.tan((22.5 * Math.PI) / 180);
        panX += (dx / height) * viewHeight;
        panY -= (dy / height) * viewHeight;
    }

    function wheel(event: WheelEvent) {
        if (!interactive) {
            return;
        }
        event.preventDefault();
        zoomBy(Math.exp(event.deltaY * 0.0015));
    }

    // Frame rate, counted over each second.
    let fps = 0;
    let frameMs = 0;
    let fpsFrames = 0;
    let fpsStart = 0;
    let renderMs = 0;

    function doRender(timestamp: number) {
        const frameTime = timestamp - lastFrame;
        // Aim for 30 fps
        const frames = Math.round(frameTime / 33);
        if (frames > 1 && lastFrame > 0) {
            _droppedFrames++;
            // TODO: Drop the model detail
        }
        lastFrame = timestamp;
        const started = performance.now();
        renderScene();
        renderMs += performance.now() - started;
        countFrame(timestamp);
        if (canRender && enabled) {
            requestAnimationFrame(doRender);
        } else {
            lastFrame = 0;
            fpsStart = 0;
        }
    }

    function countFrame(timestamp: number) {
        if (fpsStart == 0) {
            fpsStart = timestamp;
            fpsFrames = 0;
            renderMs = 0;
            return;
        }
        fpsFrames++;
        const elapsed = timestamp - fpsStart;
        if (elapsed >= 1000) {
            fps = Math.round((fpsFrames * 1000) / elapsed);
            frameMs = renderMs / fpsFrames;
            fpsStart = timestamp;
            fpsFrames = 0;
            renderMs = 0;
        }
    }

    function queueRender() {
        if (!canRender) {
            return;
        }
        requestAnimationFrame(doRender);
    }

    function renderScene() {
        if (!gl) {
            return;
        }

        let leftBarrierHit = false;
        let rightBarrierHit = false;
        let bottomBarrierHit = false;
        let topBarrierHit = false;
        gl.resizeToFit();
        gl.setModelIdentity();
        gl.clearColour(0.0, 0.0, 0.0);
        gl.clear();
        if (robotFocus) {
            gl.translate(panX, panY, -3 * zoom);
        } else {
            gl.translate(panX, panY, -30 * zoom);
        }
        // Make unit meters
        gl.scale(0.01);

        let pitch = orbitPitch;
        if (tilt) {
            pitch += robotFocus ? 30 : 45;
        }
        if (pitch != 0) {
            gl.rotate(pitch, 1.0, 0.0, 0.0);
        }
        if (camera == 'adaptive') {
            if (gl.getCanvasAspect() >= 1.0) {
                gl.rotate(0, 0.0, 1.0, 0.0);
            } else {
                gl.rotate(90, 0.0, 1.0, 0.0);
            }
        } else if (camera == 'top') {
            gl.rotate(90, 1.0, 0.0, 0.0);
        } else if (camera == 'left') {
            gl.rotate(90, 0.0, 1.0, 0.0);
        } else if (camera == 'right') {
            gl.rotate(-90, 0.0, 1.0, 0.0);
        } else if (camera == 'front') {
            gl.rotate(0, 0.0, 1.0, 0.0);
        } else if (camera == 'back') {
            gl.rotate(180, 0.0, 1.0, 0.0);
        }
        if (rotate) {
            gl.rotate(angle, 0.0, 1.0, 0.0);
        }
        if (orbitYaw != 0) {
            gl.rotate(orbitYaw, 0.0, 1.0, 0.0);
        }
        if (scene.robot && scene.robot.compiled && mapTexture) {
            const w = mapTexture.width / 2;
            const h = mapTexture.height / 2;
            const obj = scene.robot;
            const bbox = scene.robot.compiled.bbox;
            let sphereIntersect = false;
            const cx = 0.5 * (bbox.min.x + bbox.max.x);
            const cy = 0.5 * (bbox.min.y + bbox.max.y);
            const cz = 0.5 * (bbox.min.z + bbox.max.z);
            let matrix = m4.identity();
            if (obj.position) {
                matrix = m4.translate(matrix, obj.position.x, obj.position.y, obj.position.z);
            }
            if (obj.rotation) {
                //matrix = m4.axisRotate(matrix, [0.0, 1.0, 0.0], obj.rotation);
            }

            // Check bounding sphere first
            const c = m4.transformVector(matrix, [cx, cy, cz, 1.0]);
            if ((c[0] + w) * (c[0] + w) < bbox.radius) {
                sphereIntersect = true;
                // check bbox, left
            } else if ((c[0] - w) * (c[0] - w) < bbox.radius) {
                sphereIntersect = true;
                // check bbox, right
            } else if ((c[2] + h) * (c[2] + h) < bbox.radius) {
                sphereIntersect = true;
                // check bbox, bottom
            } else if ((c[2] - h) * (c[2] - h) < bbox.radius) {
                sphereIntersect = true;
                // check bbox, top
            }

            if (sphereIntersect) {
                // Do a quick check on min and max
                const p1 = [bbox.min.x, bbox.min.y, bbox.min.z, 1.0];
                const p2 = [bbox.max.x, bbox.min.y, bbox.min.z, 1.0];
                const p3 = [bbox.min.x, bbox.min.y, bbox.max.z, 1.0];
                const p4 = [bbox.max.x, bbox.min.y, bbox.max.z, 1.0];
                for (const p of [p1, p2, p3, p4]) {
                    const pt = m4.transformVector(matrix, p);
                    if (pt[0] < -w) {
                        leftBarrierHit = true;
                    }
                    if (pt[0] > w) {
                        rightBarrierHit = true;
                    }
                    if (pt[2] < -h) {
                        bottomBarrierHit = true;
                    }
                    if (pt[2] > h) {
                        topBarrierHit = true;
                    }
                }
            }
        }
        if (robotFocus) {
            if (scene.robot) {
                const obj = scene.robot;
                if (obj.rotation) {
                    gl.rotate(-obj.rotation, 0.0, 1.0, 0.0);
                }
                if (obj.position) {
                    gl.translate(-obj.position.x, -obj.position.y, -obj.position.z);
                }
            }
        }
        if (mapTexture) {
            const w = mapTexture.width / 2;
            const h = mapTexture.height / 2;
            if (dimMap) {
                gl.setBrightness(0.5);
            } else {
                if (select === '#map' || select === '#all') {
                    gl.setBrightness(1.0);
                } else {
                    gl.setBrightness(0.3);
                }
            }
            gl.pushMatrix();
            gl.drawTexturedQuad(mapTexture);
            gl.popMatrix();
            if (bottomBarrierHit || topBarrierHit || leftBarrierHit || rightBarrierHit) {
                gl.setBrightness(1.0);
            }
            if ($boundaryStore.draw || $boundaryStore.collisions) {
                const quads: Quad[] = [];
                const size = 50.0 * $boundaryStore.scale;
                if (bottomBarrierHit || $boundaryStore.draw) {
                    quads.push({
                        colour: bottomBarrierHit ? red : brown,
                        p1: { x: -w, y: 0.0, z: -h },
                        p2: { x: -w, y: size, z: -h },
                        p3: { x: w, y: size, z: -h },
                        p4: { x: w, y: 0.0, z: -h }
                    });
                }
                if (topBarrierHit || $boundaryStore.draw) {
                    quads.push({
                        colour: topBarrierHit ? red : brown,
                        p1: { x: -w, y: 0.0, z: h },
                        p2: { x: -w, y: size, z: h },
                        p3: { x: w, y: size, z: h },
                        p4: { x: w, y: 0.0, z: h }
                    });
                }
                if (rightBarrierHit || $boundaryStore.draw) {
                    quads.push({
                        colour: rightBarrierHit ? red : brown,
                        p1: { x: w, y: 0.0, z: -h },
                        p2: { x: w, y: size, z: -h },
                        p3: { x: w, y: size, z: h },
                        p4: { x: w, y: 0.0, z: h }
                    });
                }
                if (leftBarrierHit || $boundaryStore.draw) {
                    quads.push({
                        colour: leftBarrierHit ? red : brown,
                        p1: { x: -w, y: 0.0, z: -h },
                        p2: { x: -w, y: size, z: -h },
                        p3: { x: -w, y: size, z: h },
                        p4: { x: -w, y: 0.0, z: h }
                    });
                }
                gl.drawQuads(quads);
            }
            gl.setBrightness(1.0);
        }
        gl.translate(0, 0, 0);
        for (const obj of scene.objects) {
            if (select === obj.name || select === '#all') {
                gl.setBrightness(1.0);
            } else {
                gl.setBrightness(0.3);
            }
            gl.pushMatrix();
            if (obj.position) {
                gl.translate(obj.position.x, obj.position.y, obj.position.z);
            }
            if (obj.rotation) {
                gl.rotate(obj.rotation, 0.0, 1.0, 0.0);
            }
            if (obj.compiled) {
                gl.drawCompiled(obj.compiled);
            } else {
                gl.drawBox(100, 100, 100);
            }
            gl.popMatrix();
            gl.setBrightness(1.0);
        }

        if (scene.robot) {
            const obj = scene.robot;
            if (select === '#robot' || select === '#all') {
                gl.setBrightness(1.0);
            } else {
                gl.setBrightness(0.3);
            }
            gl.pushMatrix();
            if (obj.position) {
                gl.translate(obj.position.x, obj.position.y, obj.position.z);
            }
            if (obj.rotation) {
                gl.rotate(obj.rotation, 0.0, 1.0, 0.0);
            }
            if (obj.compiled) {
                gl.drawCompiled(obj.compiled);
            } else {
                gl.drawBox(100, 100, 100);
            }
            gl.popMatrix();
            gl.setBrightness(1.0);
        }

        gl.flush();
        if (rotate) {
            angle = angle + 5 * 0.1;
            if (angle > 360) {
                angle = angle - 360;
            }
        } else {
            angle = 0;
        }
    }

    function checkEnabled(enabled: boolean) {
        if (enabled) {
            queueRender();
        }
    }

    async function loadMapTexture(map: Blob | undefined) {
        if (!gl) {
            mapTexture = null;
            return;
        }
        if (mapTexture) {
            gl.deleteTexture(mapTexture.texture);
        }
        if (!map) {
            mapTexture = null;
            return;
        }
        mapTexture = await gl.loadTexture(map);
        // We could get the size from the texture.
        // But better not, since it isn't real units.
        // mapWidth = mapTexture.width;
        // mapHeight = mapTexture.height;
        if (mapTexture) {
            mapTexture.width = scene.mapWidth;
            mapTexture.height = scene.mapHeight;
        }
    }

    function loadRobot(robot: SceneObject, forceCompile: boolean, unresolved: string[]) {
        if (!gl) {
            return;
        }
        if (unresolved.length > 0) {
            return;
        }
        const obj = robot;
        if (obj.bricks) {
            if (!obj.compiled || forceCompile) {
                obj.compiled = gl.compileModel(obj.bricks, { rescale: false });
            }
        }
        if (!obj.position && obj.compiled) {
            obj.position = { x: 0.0, y: -obj.compiled.bbox.min.y, z: 0.0 };
        } else if (obj.compiled && obj.position) {
            obj.position = { x: obj.position.x, y: -obj.compiled.bbox.min.y, z: obj.position.z };
        } else if (obj.compiled) {
            obj.position = { x: 0.0, y: -obj.compiled.bbox.min.y, z: 0.0 };
        }
    }

    function loadSceneItems(objects: SceneObject[], forceCompile: boolean, unresolved: string[]) {
        if (!gl) {
            return;
        }
        if (unresolved.length > 0) {
            return;
        }
        for (const obj of objects) {
            if (obj.bricks) {
                if (!obj.compiled || forceCompile) {
                    obj.compiled = gl.compileModel(obj.bricks, { rescale: false });
                }
            }
            if (!obj.position && obj.compiled) {
                obj.position = { x: 0.0, y: -obj.compiled.bbox.min.y, z: 0.0 };
            }
        }
    }

    onMount(() => {
        const canvas = document.getElementById(id);
        if (canvas) {
            gl = WebGL.create(canvas as HTMLCanvasElement);
            if (gl) {
                gl.lighting = true;
                loadSceneItems(scene.objects, false, unresolved);
                loadRobot(scene.robot, false, unresolved);
                loadMapTexture(scene.map);
            }
            canRender = true;
            queueRender();
        } else {
            console.log('No WebGL available');
        }
    });

    onDestroy(() => {
        canRender = false;
        if (mapTexture && gl) {
            gl.deleteTexture(mapTexture.texture);
            mapTexture = null;
        }
    });

    function setMapSize(scene: SceneStore) {
        if (mapTexture) {
            mapTexture.width = scene.mapWidth;
            mapTexture.height = scene.mapHeight;
        }
    }

    $: checkEnabled(enabled);
    $: loadMapTexture(scene.map);
    $: setMapSize(scene);
    $: loadSceneItems(scene.objects, false, unresolved);
    $: loadRobot(scene.robot, false, unresolved);
</script>

<div class="relative {$$props.class}">
    <canvas
        {id}
        class="h-full w-full {interactive ? 'touch-none cursor-grab active:cursor-grabbing' : ''}"
        on:pointerdown={pointerDown}
        on:pointermove={pointerMove}
        on:pointerup={pointerUp}
        on:pointercancel={pointerUp}
        on:wheel={wheel}
        on:dblclick={() => interactive && resetView()}
        on:contextmenu={(e) => interactive && e.preventDefault()}
    ></canvas>
    {#if interactive && viewChanged}
        <button
            class="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80"
            title="Or double-click the view"
            on:click={resetView}
        >
            Reset view
        </button>
    {/if}
    {#if $showFps}
        <div
            class="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-xs text-white pointer-events-none"
        >
            {fps} FPS · {frameMs.toFixed(1)} ms draw · {gl
                ? `${gl.getCanvasWidth()}×${gl.getCanvasHeight()}`
                : ''}
        </div>
    {/if}
</div>
