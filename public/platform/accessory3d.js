import {characterFor} from './characters.js';

// The character's accessory as a 3D group for games that draw a head. Units are head radii and
// the origin is the head centre, y up; `forward` is the z direction the face looks at (+1 or -1).
// THREE and the material factory come from the game, so each game keeps its own engine import,
// material cache and disposal rules. Returns null for a character without an accessory.
export function buildAccessory(THREE, id, {material, forward = 1} = {}) {
  const c = characterFor(id), accent = material(c.accent), group = new THREE.Group();
  group.name = `accessory:${c.accessory}`;
  const add = (geometry, mat, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x, y, z * forward);
    mesh.castShadow = true; group.add(mesh); return mesh;
  };
  const cap = (radius, part) => new THREE.SphereGeometry(radius, 22, 12, 0, Math.PI * 2, 0, Math.PI * part);
  switch (c.accessory) {
    case 'beanie':
      add(cap(1.06, .46), accent, 0, .04);
      add(new THREE.TorusGeometry(1.0, .13, 10, 26), accent, 0, .38).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(.28, 12, 10), accent, 0, 1.12);
      break;
    case 'scarf':
      add(new THREE.TorusGeometry(1.0, .24, 10, 26), accent, 0, -1.0).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(.32, .85, .14), accent, .35, -1.5, .95);
      break;
    case 'helmet':
      add(cap(1.13, .55), accent);
      add(new THREE.BoxGeometry(.2, .26, 1.5), material(c.shade), 0, 1.08);
      break;
    case 'headphones': {
      add(new THREE.TorusGeometry(1.12, .09, 8, 24, Math.PI), accent);
      for (const side of [-1, 1]) add(new THREE.CylinderGeometry(.34, .34, .3, 16), accent, side * 1.08, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'crown':
      add(new THREE.CylinderGeometry(.64, .64, .32, 20), accent, 0, .98); // closed: never touches the shared material
      for (let i = 0; i < 5; i++) {
        const angle = i / 5 * Math.PI * 2;
        add(new THREE.ConeGeometry(.15, .34, 8), accent, Math.cos(angle) * .64, 1.3, Math.sin(angle) * .64);
      }
      break;
    case 'glasses':
      for (const side of [-1, 1]) add(new THREE.TorusGeometry(.3, .06, 8, 20), accent, side * .37, .1, .98);
      add(new THREE.BoxGeometry(.16, .06, .06), accent, 0, .12, .98);
      break;
    case 'cap':
      add(cap(1.07, .5), accent, 0, .02);
      add(new THREE.BoxGeometry(1.1, .07, .78), accent, 0, .14, 1.12);
      break;
    case 'brimhat': {
      const hat = material(c.shade);
      add(new THREE.CylinderGeometry(2.0, 2.0, .16, 28), hat, 0, .95);
      add(new THREE.CylinderGeometry(1.08, 1.18, 1.2, 22), hat, 0, 1.6);
      add(new THREE.TorusGeometry(1.2, .1, 8, 24), accent, 0, 1.12).rotation.x = Math.PI / 2;
      break;
    }
    case 'collar': {
      add(new THREE.TorusGeometry(.9, .14, 8, 24), accent, 0, -1.05).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(.34, .3, .12), accent, 0, -1.15, .9);
      const metal = material(c.trim);
      add(new THREE.BoxGeometry(.13, .62, .09), metal, 0, -1.85, 1.0);
      add(new THREE.BoxGeometry(.4, .13, .09), metal, 0, -1.7, 1.0);
      break;
    }
    case 'takke':
      add(new THREE.CylinderGeometry(.86, .95, .5, 22), accent, 0, .72);
      add(cap(.86, .5), accent, 0, .96).scale.y = .45;
      break;
    case 'sash': {
      add(new THREE.TorusGeometry(1.0, .28, 10, 26), accent, 0, -1.05).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(.42, 1.0, .16), accent, -.5, -1.6, .9).rotation.z = .45;
      break;
    }
    case 'bow': {
      const bow = new THREE.Group(); bow.position.set(.5, .85, 0); bow.rotation.z = -.35; group.add(bow);
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(.3, .52, 4), accent);
        wing.position.x = side * .3; wing.rotation.z = side * Math.PI / 2; wing.castShadow = true; bow.add(wing);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), accent); bow.add(knot);
      break;
    }
    default: return null;
  }
  // A beard wraps the chin below the eyes.
  if (c.beard) add(new THREE.SphereGeometry(.62, 14, 10), material(c.beard), 0, -.55, .55).scale.set(1, .7, .62);
  return group;
}
