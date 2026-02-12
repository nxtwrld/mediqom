import * as THREE from "three";

export function fillWithPoints(
  geometry: THREE.BufferGeometry,
  count: number,
): THREE.BufferGeometry {
  const dummyTarget = new THREE.Vector3(); // to prevent logging of warnings from ray.at() method

  const ray = new THREE.Ray();

  const size = new THREE.Vector3();
  geometry.computeBoundingBox();
  let bbox = geometry.boundingBox;

  if (!bbox) {
    // If no bounding box, return empty geometry
    return new THREE.BufferGeometry();
  }

  let points = [];

  const dir = new THREE.Vector3(1, 1, 1).normalize();
  /*for (let i = 0; i < count; i++) {
      let p = setRandomVector(bbox.min, bbox.max);
      points.push(p);
    }*/
  let counter = 0;
  while (counter < count) {
    let v = new THREE.Vector3(
      THREE.MathUtils.randFloat(bbox.min.x, bbox.max.x),
      THREE.MathUtils.randFloat(bbox.min.y, bbox.max.y),
      THREE.MathUtils.randFloat(bbox.min.z, bbox.max.z),
    );
    if (isInside(v)) {
      points.push(v);
      counter++;
    }
  }

  /*function setRandomVector(min, max){
      let v = new THREE.Vector3(
        THREE.Math.randFloat(min.x, max.x),
        THREE.Math.randFloat(min.y, max.y),
        THREE.Math.randFloat(min.z, max.z)
      );
      if (!isInside(v)){return setRandomVector(min, max);}
      return v;
    }*/

  function isInside(v: THREE.Vector3) {
    ray.set(v, dir);
    let counter = 0;

    let pos = geometry.attributes.position;
    let faces = pos.count / 3;
    //console.log(faces);
    let vA = new THREE.Vector3(),
      vB = new THREE.Vector3(),
      vC = new THREE.Vector3();
    for (let i = 0; i < faces; i++) {
      vA.fromBufferAttribute(pos, i * 3 + 0);
      vB.fromBufferAttribute(pos, i * 3 + 1);
      vC.fromBufferAttribute(pos, i * 3 + 2);
      if (ray.intersectTriangle(vA, vB, vC, false, dummyTarget)) counter++;
    }

    return counter % 2 == 1;
  }
  //console.log(points.length);
  return new THREE.BufferGeometry().setFromPoints(points);
}
