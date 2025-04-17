import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { forwardRef, useEffect, useRef } from 'react';

interface CustomOrbitControlsProps {
  objects: THREE.Object3D[];
  sizeScale: number;
}

export const CustomOrbitControls = forwardRef<any, CustomOrbitControlsProps>(
  ({ objects, sizeScale, ...props }, ref) => {
    const { camera } = useThree();
    const controlsRef = useRef<any>(null);

    useEffect(() => {
      const controls = controlsRef.current;
      if (!controls) return;

      // Store original zoom function
      const originalZoom = controls.zoom.bind(controls);

      // Override zoom function
      controls.zoom = (delta: number) => {
        const zoomScale = Math.pow(0.95, delta);
        const cameraPosition = camera.position.clone();
        const newPosition = cameraPosition.clone().multiplyScalar(zoomScale);
        const moveVector = newPosition.clone().sub(cameraPosition);

        // Check distance to each object's surface
        for (const obj of objects) {
          if (!obj.visible) continue;

          const objWorldPos = new THREE.Vector3();
          obj.getWorldPosition(objWorldPos);
          
          // Get object's scale (radius)
          const scale = obj.scale.x; // Assuming uniform scale
          const surfaceRadius = scale * sizeScale;

          // Calculate distance from camera to object surface
          const distanceToCenter = cameraPosition.distanceTo(objWorldPos);
          const distanceToSurface = distanceToCenter - surfaceRadius;

          // If zoom would move us inside the object, prevent it
          const newDistance = distanceToSurface - moveVector.length();
          if (newDistance < surfaceRadius * 0.1) { // Keep small buffer distance
            return;
          }
        }

        // If we haven't returned yet, it's safe to zoom
        originalZoom(delta);
      };

      return () => {
        // Restore original zoom function on cleanup
        if (controls) controls.zoom = originalZoom;
      };
    }, [objects, sizeScale, camera]);

    return (
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.3}
        panSpeed={1.0}
        zoomSpeed={1.0}
        minDistance={0.0001/206265}
        maxDistance={10000}
        screenSpacePanning={true}
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        }}
        {...props}
      />
    );
  }
); 