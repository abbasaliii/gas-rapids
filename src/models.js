import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Character models (all free to use commercially; credits in the Credits panel):
 *   pig      Quaternius, CC0           (animated)
 *   raccoon  Quaternius, CC0           (animated)
 *   skunk    Poly by Google, CC-BY 3.0
 *   frog     Poly by Google, CC-BY 3.0
 *   seal     Poly by Google, CC-BY 3.0
 * Each is normalised to a target height, re-centred on its feet, and turned to face local +z (toward the raft centre).
 */
export const MODELS = {
  skunk: { file: 'skunk_google.glb', height: 2.0, yaw: Math.PI, lift: 0 },
  pig: { file: 'pig_quaternius.glb', height: 1.9, yaw: Math.PI, lift: 0, anim: /idle/i },
  frog: { file: 'frog_google.glb', height: 1.5, yaw: Math.PI, lift: 0 },
  seal: { file: 'seal_google.glb', height: 2.0, yaw: Math.PI, lift: 0 },
  raccoon: { file: 'raccoon_quaternius.glb', height: 1.3, yaw: Math.PI, lift: 0, anim: /idle/i },
};

const loader = new GLTFLoader();
const cache = new Map();
const base = (import.meta.env && import.meta.env.BASE_URL) || './';

/** Loads (once) and returns a fresh instance: { group, mixer, clips, ready }. */
export function loadModel(kind) {
  const spec = MODELS[kind];
  if (!spec) return Promise.reject(new Error('no model ' + kind));
  if (!cache.has(kind)) {
    cache.set(kind, new Promise((resolve, reject) => {
      loader.load(base + 'models/' + spec.file, (gltf) => {
        const src = gltf.scene;
        // normalise: scale to height, feet on y=0, centred in x/z, facing +z
        const box = new THREE.Box3().setFromObject(src);
        const size = box.getSize(new THREE.Vector3());
        const s = spec.height / Math.max(1e-6, size.y);
        const wrap = new THREE.Group();
        src.scale.setScalar(s);
        src.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(src);
        const c = box2.getCenter(new THREE.Vector3());
        src.position.set(-c.x, -box2.min.y + spec.lift, -c.z);
        const turn = new THREE.Group(); turn.rotation.y = spec.yaw; turn.add(src);
        wrap.add(turn);
        src.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        resolve({ scene: wrap, clips: gltf.animations || [] });
      }, undefined, reject);
    }));
  }
  return cache.get(kind).then(({ scene, clips }) => {
    const group = cloneWithSkeleton(scene);
    let mixer = null;
    const spec = MODELS[kind];
    if (clips.length) {
      mixer = new THREE.AnimationMixer(group);
      const clip = clips.find((cl) => spec.anim && spec.anim.test(cl.name)) || clips[0];
      const action = mixer.clipAction(clip); action.play();
    }
    return { group, mixer, clips };
  });
}

/** three's SkeletonUtils.clone, inlined so skinned models clone correctly. */
function cloneWithSkeleton(source) {
  const sourceLookup = new Map(), cloneLookup = new Map();
  const clone = source.clone();
  parallelTraverse(source, clone, (a, b) => { sourceLookup.set(b, a); cloneLookup.set(a, b); });
  clone.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    const src = sourceLookup.get(node), srcBones = src.skeleton.bones;
    node.skeleton = src.skeleton.clone();
    node.bindMatrix.copy(src.bindMatrix);
    node.skeleton.bones = srcBones.map((b) => cloneLookup.get(b));
    node.bind(node.skeleton, node.bindMatrix);
  });
  return clone;
}
function parallelTraverse(a, b, cb) { cb(a, b); for (let i = 0; i < a.children.length; i++) parallelTraverse(a.children[i], b.children[i], cb); }
