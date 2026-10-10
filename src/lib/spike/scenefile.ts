// Turns the current scene into a .spk file (zip of scene.json, the mat image
// and the obstacle models).

import JSZip from 'jszip';
import { saveMPD } from '$lib/ldraw/components';
import { type SceneStore } from '$lib/spike/scene';

export async function sceneToBlob(scene: SceneStore): Promise<Blob> {
    const zip = new JSZip();
    if (scene.map) {
        zip.file('mat.jpg', scene.map);
    }
    for (const obj of scene.objects) {
        if (obj.bricks) {
            zip.file(`bricks-${obj.name}`, saveMPD(obj.bricks));
        }
    }
    const json = {
        version: 1,
        robot: {
            anchored: scene.robot.anchored,
            position: scene.robot.position,
            rotation: scene.robot.rotation,
            name: '#robot'
        },
        matWidth: scene.mapWidth,
        matHeight: scene.mapHeight,
        objects: scene.objects.map((o) => ({
            anchored: o.anchored,
            position: o.position,
            rotation: o.rotation,
            name: o.name
        }))
    };
    zip.file('scene.json', JSON.stringify(json));
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
