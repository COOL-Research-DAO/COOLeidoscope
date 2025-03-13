import { useRef } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

export function CoordinateAxes() {
  const axesRef = useRef<THREE.Group>(null);
  const axisLength = 10;
  const axisWidth = 0.1;

  return (
    <group ref={axesRef}>
      {/* X-axis (Red) */}
      <mesh position={[axisLength / 2, 0, 0]}>
        <cylinderGeometry args={[axisWidth, axisWidth, axisLength, 32]} />
        <meshStandardMaterial color="red" />
      </mesh>
      <Text position={[axisLength + 0.5, 0, 0]} fontSize={0.5} color="red" anchorX="left" anchorY="middle">
        X
      </Text>

      {/* Y-axis (Green) */}
      <mesh position={[0, axisLength / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[axisWidth, axisWidth, axisLength, 32]} />
        <meshStandardMaterial color="green" />
      </mesh>
      <Text position={[0, axisLength + 0.5, 0]} fontSize={0.5} color="green" anchorX="center" anchorY="bottom">
        Y
      </Text>

      {/* Z-axis (Blue) */}
      <mesh position={[0, 0, axisLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[axisWidth, axisWidth, axisLength, 32]} />
        <meshStandardMaterial color="blue" />
      </mesh>
      <Text position={[0, 0, axisLength + 0.5]} fontSize={0.5} color="blue" anchorX="center" anchorY="middle">
        Z
      </Text>
    </group>
  );
} 