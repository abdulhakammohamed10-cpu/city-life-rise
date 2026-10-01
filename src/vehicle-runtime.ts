import * as THREE from "three";

export const vehicleRuntime = {
  x: 34,
  z: 21,
  yaw: 0,
  speed: 0,
  steer: 0,
  roll: 0,
  pitch: 0,
  fuel: 100,
  wheelSpin: 0,
  velocity: new THREE.Vector3(),
  justEnteredAt: 0,
  brake: false,
  reverse: false,
  wheelAngle: 0,
};

export function resetVehicleRuntime(x = 34, z = 21, yaw = 0) {
  vehicleRuntime.x = x;
  vehicleRuntime.z = z;
  vehicleRuntime.yaw = yaw;
  vehicleRuntime.speed = 0;
  vehicleRuntime.steer = 0;
  vehicleRuntime.roll = 0;
  vehicleRuntime.pitch = 0;
  vehicleRuntime.fuel = 100;
  vehicleRuntime.wheelSpin = 0;
  vehicleRuntime.velocity.set(0, 0, 0);
  vehicleRuntime.justEnteredAt = performance.now();
  vehicleRuntime.brake = false;
  vehicleRuntime.reverse = false;
  vehicleRuntime.wheelAngle = 0;
}
