import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import type { IAnimation } from "./animation.js";

const models: string[] = [
  //'Bacteria_1.obj',
  "Bacteria_19.obj",
  "Virus_1.obj",
  "Virus_2.obj",
  "Virus_10.obj",
];

const colors: number[] = [
  0xcc6633, 0x80bf35, 0x745d6b, 0x9f8033, 0x66737e, 0x00ffff, 0xffffff,
];

export default class Vaccination implements IAnimation {
  name: string = "Vaccination";
  private objects: THREE.Mesh[] = [];
  private sceneBoundaries: any = {
    minX: -2000,
    maxX: 2000,
    minY: -2000,
    maxY: 2000,
    minZ: -2000,
    maxZ: 2000,
  };
  private scene: THREE.Scene | null;
  private objectBounced: THREE.Object3D | null = null;
  private velocity: number = 0.03;
  private group: THREE.Group = new THREE.Group();
  private objectCount: number = 100;

  constructor(scene: THREE.Scene, boundaries?: any) {
    this.scene = scene;
    const shadeSkin = this.scene.getObjectByName("shade_skin");
    if (shadeSkin) {
      this.objectBounced = shadeSkin.getObjectByName("body") || null;
    }

    if (boundaries) this.sceneBoundaries = boundaries;

    this.scene.add(this.group);

    this.add();
  }
  async add() {
    const loader = new OBJLoader();

    const objs: THREE.Mesh[] = await Promise.all(
      models.map((m) => {
        return new Promise<THREE.Mesh>((resolve, reject) => {
          loader.load(
            "/models/biology/" + m,
            (object: THREE.Group) => {
              resolve(object.children[0] as THREE.Mesh);
            },
            () => {},
            (error: unknown) => {
              console.log(error);
              reject(error);
            },
          );
        });
      }),
    );

    // Initialize objects and their velocities
    for (let i = 0; i < this.objectCount; i++) {
      //const boundaries = calculateBoundaries(camera, depthValue);
      // Create Sphere Geometry
      //const geometry = new THREE.SphereGeometry(20, 32, 32);
      // Create a Material
      //const material = new THREE.MeshLambertMaterial({ color: 0xff0000 }); // Red color for example

      //const object = new THREE.Mesh(geometry , material );

      const randomNumber: number = Math.floor(Math.random() * objs.length);
      const object = objs[randomNumber].clone();
      object.scale.set(1.2, 1.2, 1.2);

      object.material = new THREE.MeshStandardMaterial({
        color: colors[randomNumber],
      }); // Red color for example
      object.material.opacity = 0.65;
      object.material.transparent = true;
      object.position.copy(this.randomPosition(this.sceneBoundaries, object));
      object.initialVelocity = this.randomVelocity(this.velocity, object);
      object.velocity = object.initialVelocity.clone();
      this.group.add(object);
      this.objects.push(object);
    }
  }
  destroy() {
    this.objects.slice().forEach((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
      this.group.remove(object); // Remove object from scene
      const index = this.objects.indexOf(object); // Find the object in the original array
      if (index > -1) {
        this.objects.splice(index, 1); // Remove object from array
      }
    });
    if (this.scene) {
      this.scene.remove(this.group);
    }
    this.scene = null;
    this.objectBounced = null;
  }

  update() {
    if (!this.objectBounced) return;

    const bouncedBoundingBox = new THREE.Box3().setFromObject(
      this.objectBounced,
    );
    const attractionStrength = 0.05;

    const targetBoundingBox = new THREE.Box3().setFromObject(
      this.objectBounced,
    );

    this.objects.forEach((object: THREE.Mesh) => {
      if (!object.velocity || !object.initialVelocity) return;

      // Calculate attraction force towards the cube
      const attractionForce = this.calculateAttractionForce(
        object,
        this.objectBounced!,
        attractionStrength,
      );
      object.velocity.add(attractionForce);

      // Update position
      object.position.add(object.velocity);

      const objectBoundingBox = new THREE.Box3().setFromObject(object);
      if (objectBoundingBox.intersectsBox(targetBoundingBox)) {
        // Collision response: invert velocity
        object.velocity.multiplyScalar(-30);

        // Optional: Add some randomness or modify the response as needed
      }

      // Boundary checks
      if (
        object.position.x < this.sceneBoundaries.minX ||
        object.position.x > this.sceneBoundaries.maxX ||
        object.position.y < this.sceneBoundaries.minY ||
        object.position.y > this.sceneBoundaries.maxY ||
        object.position.z < this.sceneBoundaries.minZ ||
        object.position.z > this.sceneBoundaries.maxZ
      ) {
        // Invert velocity for bounce
        //object.velocity = this.randomVelocity(this.velocity, object);
        object.velocity.copy(object.initialVelocity);

        // Optional: Increase the magnitude of the velocity after bounce
        //object.velocity.multiplyScalar(1.2); // Adjust multiplier as needed
      }
    });
  }

  randomVelocity(maxSpeed: number, object: THREE.Mesh) {
    // random velocity - some elemetns just float around and others will be attracted to body
    if (Math.random() > 0.7 || !this.objectBounced) {
      return new THREE.Vector3(
        (Math.random() - 0.5) * 2 * maxSpeed,
        (Math.random() - 0.5) * 2 * maxSpeed,
        (Math.random() - 0.5) * 2 * maxSpeed,
      );
    } else {
      // Calculate velocity towards the body
      const direction = new THREE.Vector3().subVectors(
        this.objectBounced.position,
        object.position,
      );
      direction.normalize(); // Normalize to get the direction
      direction.multiplyScalar((Math.random() - 0.5) * 2 * maxSpeed); // Scale to the desired speed
      return direction;
    }

    /*
     */
  }
  randomPosition(boundaries: any, object: THREE.Mesh) {
    let position: THREE.Vector3;
    let retries = 10;
    do {
      position = this.generateRandomPosition(boundaries);
      object.position.copy(position);

      if (retries-- <= 0) break; // Avoid infinite loop, give up after certain retries
    } while (
      this.objectBounced &&
      this.isOverlapping(object, this.objectBounced)
    );
    return position;
  }

  generateRandomPosition(boundaries: any) {
    return new THREE.Vector3(
      Math.random() * (boundaries.maxX - boundaries.minX) + boundaries.minX,
      Math.random() * (boundaries.maxY - boundaries.minY) + boundaries.minY,
      Math.random() * (boundaries.maxZ - boundaries.minZ) + boundaries.minZ,
    );
  }

  isOverlapping(newObject: THREE.Mesh, existingObject: THREE.Object3D) {
    const newObjectBoundingBox = new THREE.Box3().setFromObject(newObject);

    const existingObjectBoundingBox = new THREE.Box3().setFromObject(
      existingObject,
    );
    if (newObjectBoundingBox.intersectsBox(existingObjectBoundingBox)) {
      return true; // Overlap detected
    }

    return false; // No overlap
  }

  calculateAttractionForce(
    object: THREE.Mesh,
    target: THREE.Object3D,
    strength: number,
  ) {
    const direction = new THREE.Vector3().subVectors(
      target.position,
      object.position,
    );
    const distance = direction.length();
    direction.normalize(); // Normalize to get direction
    direction.multiplyScalar(strength / distance); // Force magnitude decreases with distance
    return direction;
  }
}
