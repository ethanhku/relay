import { BreadboardAssistant, DetectedComponent, BreadboardHole } from "./BreadboardAssistant";
import { BreadboardDepthMapper } from "./BreadboardDepthMapper";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { LSTween } from "LSTween.lspkg/LSTween";
import Easing from "LSTween.lspkg/TweenJS/Easing";

// AR overlay types for different visual guidance
enum OverlayType {
  HoleHighlight = "hole_highlight",
  ComponentPlacement = "component_placement",
  ConnectionLine = "connection_line",
  CircuitPath = "circuit_path",
  ComponentLabel = "component_label"
}

// Visual highlight configuration
interface HighlightConfig {
  color: vec4;
  size: number;
  pulseSpeed: number;
  duration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
}

// AR overlay element
interface AROverlayElement {
  id: string;
  type: OverlayType;
  position: vec3;
  rotation: quat;
  scale: vec3;
  config: HighlightConfig;
  isVisible: boolean;
  sceneObject?: SceneObject;
  material?: Material;
}

@component
export class BreadboardAROverlay extends BaseScriptComponent {
  @ui.separator
  @ui.label("AR Overlay System for Breadboard Circuit Guidance")
  @ui.separator
  @ui.group_start("Setup")
  @input
  private breadboardAssistant: BreadboardAssistant;
  @input
  private depthMapper?: BreadboardDepthMapper;
  @input
  private cameraObject: SceneObject;
  @ui.group_end
  @ui.separator
  @ui.group_start("Visual Settings")
  @input
  private highlightSize: number = 0.02; // Size of hole highlights in meters
  @input
  private highlightPulseSpeed: number = 1.0; // Pulses per second
  @input
  private connectionLineWidth: number = 0.005; // Width of connection lines
  @input
  private labelOffset: number = 0.05; // Offset for component labels
  @ui.group_end
  @ui.separator
  @ui.group_start("Materials")
  @input
  private highlightMaterial: Material;
  @input
  private connectionMaterial: Material;
  @input
  private labelMaterial: Material;
  @input
  private highlightMesh: RenderMeshVisual;
  @ui.group_end

  // AR overlay state
  private activeOverlays: Map<string, AROverlayElement> = new Map();
  private overlayCounter: number = 0;
  private isDepthAPIEnabled: boolean = false;

  // Color presets for different guidance types
  private colorPresets: Map<string, vec4> = new Map([
    ["placement", new vec4(0, 1, 0, 0.8)], // Green for placement
    ["connection", new vec4(0, 0, 1, 0.6)], // Blue for connections
    ["warning", new vec4(1, 0, 0, 0.8)], // Red for warnings
    ["info", new vec4(1, 1, 0, 0.7)], // Yellow for info
    ["circuit", new vec4(1, 0.5, 0, 0.6)] // Orange for circuit paths
  ]);

  // Events
  public overlayCreatedEvent: Event<AROverlayElement> = new Event<AROverlayElement>();
  public overlayRemovedEvent: Event<string> = new Event<string>();

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
    this.initializeDepthAPI();
  }

  private onStart() {
    // Connect to breadboard assistant events
    this.breadboardAssistant.placementGuidanceEvent.add((data) => {
      this.showPlacementGuidance(data.component, data.targetHole);
    });

    this.breadboardAssistant.componentDetectedEvent.add((component) => {
      this.showComponentLabel(component);
    });

    this.breadboardAssistant.circuitCompleteEvent.add((topology) => {
      this.showCircuitTopology(topology);
    });
  }

  private initializeDepthAPI() {
    // Initialize depth API for 3D positioning using the depth mapper
    try {
      if (this.depthMapper && this.depthMapper.depthAPIIitializedEvent) {
        // Listen for depth API initialization events
        this.depthMapper.depthAPIIitializedEvent.add((isEnabled) => {
          this.isDepthAPIEnabled = isEnabled;
          if (isEnabled) {
            print("Depth API initialized successfully via BreadboardDepthMapper");
          } else {
            print("Depth API not available, using fallback positioning");
            print("This is normal for non-Spectacles devices or when depth sensing is disabled");
          }
        });
        
        // Check if depth mapper is already initialized
        this.isDepthAPIEnabled = this.depthMapper.isDepthAPIEnabled;
        print("Depth mapper connected - API enabled: " + this.isDepthAPIEnabled);
      } else {
        // Create a temporary depth mapper instance for testing
        print("Depth mapper not connected - creating temporary instance for testing");
        this.createTemporaryDepthMapper();
      }
    } catch (error) {
      print("Failed to initialize depth API: " + error);
      this.isDepthAPIEnabled = false;
    }
  }

  private createTemporaryDepthMapper() {
    // Create a temporary depth mapper instance for testing
    try {
      // Check if we're on Spectacles device
      if (global.deviceInfoSystem && global.deviceInfoSystem.isSpectacles && global.deviceInfoSystem.isSpectacles()) {
        this.isDepthAPIEnabled = true;
        print("Spectacles device detected - depth API enabled for testing");
      } else {
        this.isDepthAPIEnabled = false;
        print("Non-Spectacles device - depth API not available");
      }
    } catch (error) {
      print("Error creating temporary depth mapper: " + error);
      this.isDepthAPIEnabled = false;
    }
  }

  // Convert 2D breadboard coordinates to 3D world position
  private breadboardToWorldPosition(breadboardX: number, breadboardY: number): vec3 {
    // Convert from 0-1000 grid to normalized coordinates
    const normalizedX = (breadboardX - 500) / 500; // -1 to 1
    const normalizedY = (breadboardY - 500) / 500; // -1 to 1

    // Assume breadboard is positioned in front of camera
    const baseDistance = 0.5; // 50cm in front of camera
    const breadboardWidth = 0.2; // 20cm wide breadboard
    const breadboardHeight = 0.15; // 15cm tall breadboard

    const worldX = normalizedX * breadboardWidth;
    const worldY = normalizedY * breadboardHeight;
    let worldZ = baseDistance;

    // Use depth API if available for more accurate positioning
    if (this.isDepthAPIEnabled) {
      try {
        // Convert screen coordinates to depth reading
        const screenX = (normalizedX + 1) * 0.5; // Convert to 0-1 range
        const screenY = (normalizedY + 1) * 0.5; // Convert to 0-1 range
        
        if (this.depthMapper) {
          // Use depth mapper if available
          const depthInfo = this.depthMapper.getDepthAtPosition(screenX, screenY);
          if (depthInfo && depthInfo.isValid) {
            worldZ = depthInfo.depth;
            print(`Using depth API via mapper: ${depthInfo.depth}m at (${screenX}, ${screenY}) with confidence ${depthInfo.confidence}`);
          } else {
            print("Depth mapper reading invalid, using fallback positioning");
          }
        } else {
          // Try direct depth system access
          if ((global as any).depthSystem) {
            const depth = (global as any).depthSystem.getDepthAtScreenPosition(screenX, screenY);
            if (depth && depth.depth > 0) {
              worldZ = depth.depth;
              print(`Using depth API directly: ${depth.depth}m at (${screenX}, ${screenY})`);
            } else {
              print("Direct depth API reading invalid, using fallback positioning");
            }
          } else {
            print("Depth system not available, using fallback positioning");
          }
        }
      } catch (error) {
        print("Depth API error: " + error);
        // Fall back to default positioning
      }
    }

    return new vec3(worldX, worldY, worldZ);
  }

  // Create a visual highlight for a breadboard hole
  public highlightBreadboardHole(
    breadboardX: number, 
    breadboardY: number, 
    color: string = "placement",
    duration: number = 5000
  ): string {
    const overlayId = `hole_${this.overlayCounter++}`;
    const worldPos = this.breadboardToWorldPosition(breadboardX, breadboardY);
    
    // Create highlight sphere
    const highlightObject = global.scene.createSceneObject("HoleHighlight_" + overlayId);
    const renderMesh = highlightObject.createComponent("Component.RenderMeshVisual");
    
    print("🎯 Creating overlay at position: " + worldPos.x + ", " + worldPos.y + ", " + worldPos.z);
    
    // Assign the mesh if available
    if (this.highlightMesh && this.highlightMesh.mesh) {
      renderMesh.mesh = this.highlightMesh.mesh;
      print("✅ Assigned highlight mesh: " + this.highlightMesh.mesh.name);
    } else {
      print("⚠️ No highlight mesh assigned - overlay will be invisible");
      print("💡 Drag a SceneObject with RenderMeshVisual component to the Highlight Mesh field");
    }
    
    renderMesh.mainMaterial = this.highlightMaterial.clone();
    
    // Set up material properties
    const material = renderMesh.mainMaterial;
    const colorVec = this.colorPresets.get(color) || this.colorPresets.get("placement")!;
    material.mainPass.baseColor = colorVec;
    
    // Position the highlight
    highlightObject.getTransform().setWorldPosition(worldPos);
    highlightObject.getTransform().setLocalScale(new vec3(this.highlightSize, this.highlightSize, this.highlightSize));
    
    // Create overlay element
    const overlay: AROverlayElement = {
      id: overlayId,
      type: OverlayType.HoleHighlight,
      position: worldPos,
      rotation: new quat(0, 0, 0, 1),
      scale: new vec3(this.highlightSize, this.highlightSize, this.highlightSize),
      config: {
        color: colorVec,
        size: this.highlightSize,
        pulseSpeed: this.highlightPulseSpeed,
        duration: duration,
        fadeInDuration: 500,
        fadeOutDuration: 500
      },
      isVisible: true,
      sceneObject: highlightObject,
      material: material
    };

    this.activeOverlays.set(overlayId, overlay);
    this.overlayCreatedEvent.invoke(overlay);

    // Animate the highlight
    this.animateHoleHighlight(overlay);

    // Auto-remove after duration
    if (duration > 0) {
      // Note: Auto-removal would be implemented with Lens Studio's setTimeout
    }

    return overlayId;
  }

  // Show placement guidance for a component
  private showPlacementGuidance(component: DetectedComponent, targetHole: BreadboardHole) {
    const overlayId = this.highlightBreadboardHole(
      targetHole.x, 
      targetHole.y, 
      "placement", 
      8000
    );

    // Add component label
    this.showComponentLabel(component, targetHole);
  }

  // Show component label
  public showComponentLabel(component: DetectedComponent, targetHole?: BreadboardHole) {
    const position = targetHole ? 
      this.breadboardToWorldPosition(targetHole.x, targetHole.y) :
      this.breadboardToWorldPosition(component.position.x, component.position.y);

    // Offset label above the component
    const labelPos = new vec3(position.x, position.y + this.labelOffset, position.z);

    const overlayId = `label_${this.overlayCounter++}`;
    const labelObject = global.scene.createSceneObject("ComponentLabel_" + overlayId);
    
    // Create text component for label
    const textComponent = labelObject.createComponent("Component.Text");
    textComponent.text = `${component.type.toUpperCase()}${component.value ? ': ' + component.value : ''}`;
    // Note: Font size and alignment properties may vary in Lens Studio
    // textComponent.fontSize = 0.02;
    // textComponent.textAlign = TextAlignMode.Center;
    
    // Position the label
    labelObject.getTransform().setWorldPosition(labelPos);
    // Note: lookAt method may not be available in all Lens Studio versions
    // labelObject.getTransform().lookAt(this.cameraObject.getTransform().getWorldPosition());

    const overlay: AROverlayElement = {
      id: overlayId,
      type: OverlayType.ComponentLabel,
      position: labelPos,
      rotation: new quat(0, 0, 0, 1),
      scale: new vec3(1, 1, 1),
      config: {
        color: new vec4(1, 1, 1, 0.9),
        size: 0.02,
        pulseSpeed: 0,
        duration: 10000,
        fadeInDuration: 500,
        fadeOutDuration: 500
      },
      isVisible: true,
      sceneObject: labelObject
    };

    this.activeOverlays.set(overlayId, overlay);
    this.overlayCreatedEvent.invoke(overlay);

    // Auto-remove after duration
    // Note: Auto-removal would be implemented with Lens Studio's setTimeout
  }

  // Show complete circuit topology
  public showCircuitTopology(topology: any) {
    // Highlight all connection points
    this.highlightBreadboardHole(topology.inputHole.x, topology.inputHole.y, "circuit", 15000);
    this.highlightBreadboardHole(topology.outputHole.x, topology.outputHole.y, "circuit", 15000);
    this.highlightBreadboardHole(topology.groundHole.x, topology.groundHole.y, "circuit", 15000);
    this.highlightBreadboardHole(topology.vccHole.x, topology.vccHole.y, "circuit", 15000);

    // Draw connection lines
    this.drawConnectionLine(topology.inputHole, topology.opAmp.position, "connection");
    this.drawConnectionLine(topology.opAmp.position, topology.outputHole, "connection");
    this.drawConnectionLine(topology.groundHole, topology.opAmp.position, "connection");
    this.drawConnectionLine(topology.vccHole, topology.opAmp.position, "connection");
  }

  // Draw connection line between two points
  private drawConnectionLine(startHole: BreadboardHole, endPos: { x: number; y: number }, color: string) {
    const startPos = this.breadboardToWorldPosition(startHole.x, startHole.y);
    const endWorldPos = this.breadboardToWorldPosition(endPos.x, endPos.y);

    const overlayId = `line_${this.overlayCounter++}`;
    const lineObject = global.scene.createSceneObject("ConnectionLine_" + overlayId);
    
    // Create cylinder for connection line
    const renderMesh = lineObject.createComponent("Component.RenderMeshVisual");
    // Note: Using a basic mesh - in actual implementation, you'd load the Cylinder mesh
    renderMesh.mainMaterial = this.connectionMaterial.clone();
    
    // Set up material
    const material = renderMesh.mainMaterial;
    const colorVec = this.colorPresets.get(color) || this.colorPresets.get("connection")!;
    material.mainPass.baseColor = colorVec;
    
    // Calculate line properties
    const direction = new vec3(endWorldPos.x - startPos.x, endWorldPos.y - startPos.y, endWorldPos.z - startPos.z);
    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    const center = new vec3(
      startPos.x + direction.x * 0.5,
      startPos.y + direction.y * 0.5,
      startPos.z + direction.z * 0.5
    );
    
    // Position and orient the line
    lineObject.getTransform().setWorldPosition(center);
    lineObject.getTransform().setLocalScale(new vec3(this.connectionLineWidth, length, this.connectionLineWidth));
    
    // Rotate to align with direction (simplified rotation)
    const rotation = new quat(0, 0, 0, 1);
    lineObject.getTransform().setWorldRotation(rotation);

    const overlay: AROverlayElement = {
      id: overlayId,
      type: OverlayType.ConnectionLine,
      position: center,
      rotation: rotation,
      scale: new vec3(this.connectionLineWidth, length, this.connectionLineWidth),
      config: {
        color: colorVec,
        size: this.connectionLineWidth,
        pulseSpeed: 0,
        duration: 15000,
        fadeInDuration: 1000,
        fadeOutDuration: 1000
      },
      isVisible: true,
      sceneObject: lineObject,
      material: material
    };

    this.activeOverlays.set(overlayId, overlay);
    this.overlayCreatedEvent.invoke(overlay);

    // Auto-remove after duration
    // Note: Auto-removal would be implemented with Lens Studio's setTimeout
  }

  // Animate hole highlight with pulsing effect
  private animateHoleHighlight(overlay: AROverlayElement) {
    if (!overlay.sceneObject || !overlay.material) return;

    const baseScale = overlay.config.size;
    const pulseAmount = 0.3; // 30% size variation
    const pulseDuration = 1000 / overlay.config.pulseSpeed; // Convert to milliseconds

    // Continuous pulsing animation
    const animatePulse = () => {
      LSTween.scaleToLocal(
        overlay.sceneObject!.getTransform(),
        new vec3(baseScale * (1 + pulseAmount), baseScale * (1 + pulseAmount), baseScale * (1 + pulseAmount)),
        pulseDuration / 2
      )
        .easing(Easing.Sinusoidal.InOut)
        .onComplete(() => {
          LSTween.scaleToLocal(
            overlay.sceneObject!.getTransform(),
            new vec3(baseScale * (1 - pulseAmount), baseScale * (1 - pulseAmount), baseScale * (1 - pulseAmount)),
            pulseDuration / 2
          )
            .easing(Easing.Sinusoidal.InOut)
            .onComplete(() => {
              if (overlay.isVisible) {
                animatePulse(); // Continue pulsing
              }
            })
            .start();
        })
        .start();
    };

    // Start pulsing
    animatePulse();

    // Fade in
    LSTween.rawTween(overlay.config.fadeInDuration)
      .onUpdate((tweenData) => {
        const alpha = tweenData.t as number;
        const color = overlay.config.color;
        color.a = alpha * 0.8; // Max alpha of 0.8
        overlay.material!.mainPass.baseColor = color;
      })
      .start();
  }

  // Remove an overlay
  public removeOverlay(overlayId: string): boolean {
    const overlay = this.activeOverlays.get(overlayId);
    if (!overlay) return false;

    overlay.isVisible = false;

    // Fade out animation
    if (overlay.material) {
      LSTween.rawTween(overlay.config.fadeOutDuration)
        .onUpdate((tweenData) => {
          const alpha = 1 - (tweenData.t as number);
          const color = overlay.config.color;
          color.a = alpha * 0.8;
          overlay.material!.mainPass.baseColor = color;
        })
        .onComplete(() => {
        // Remove from scene
        if (overlay.sceneObject) {
          overlay.sceneObject.enabled = false;
          // Note: destroySceneObject may not be available in all Lens Studio versions
          // global.scene.destroySceneObject(overlay.sceneObject);
        }
          this.activeOverlays.delete(overlayId);
          this.overlayRemovedEvent.invoke(overlayId);
        })
        .start();
    } else {
      // Remove immediately if no material
      if (overlay.sceneObject) {
        overlay.sceneObject.enabled = false;
        // Note: destroySceneObject may not be available in all Lens Studio versions
        // global.scene.destroySceneObject(overlay.sceneObject);
      }
      this.activeOverlays.delete(overlayId);
      this.overlayRemovedEvent.invoke(overlayId);
    }

    return true;
  }

  // Clear all overlays
  public clearAllOverlays(): void {
    const overlayIds = Array.from(this.activeOverlays.keys());
    overlayIds.forEach(id => this.removeOverlay(id));
  }

  // Get all active overlays
  public getActiveOverlays(): AROverlayElement[] {
    return Array.from(this.activeOverlays.values());
  }

  // Update overlay position (useful for tracking)
  public updateOverlayPosition(overlayId: string, newPosition: vec3): boolean {
    const overlay = this.activeOverlays.get(overlayId);
    if (!overlay || !overlay.sceneObject) return false;

    overlay.position = newPosition;
    overlay.sceneObject.getTransform().setWorldPosition(newPosition);
    return true;
  }

  // Public method to highlight multiple holes for circuit path
  public highlightCircuitPath(holes: BreadboardHole[], color: string = "circuit", duration: number = 10000): string[] {
    const overlayIds: string[] = [];
    
    holes.forEach(hole => {
      const id = this.highlightBreadboardHole(hole.x, hole.y, color, duration);
      overlayIds.push(id);
    });

    return overlayIds;
  }

  // Public method to show component placement sequence
  public showPlacementSequence(components: DetectedComponent[], targetHoles: BreadboardHole[]): void {
    if (components.length !== targetHoles.length) {
      print("Error: Component and hole arrays must have same length");
      return;
    }

    // Show each component placement with delay
    components.forEach((component, index) => {
      // Note: Sequential placement would be implemented with Lens Studio's setTimeout
      this.showPlacementGuidance(component, targetHoles[index]);
    });
  }

  // Test method to create a visible overlay at a specific position
  public testCreateVisibleOverlay(): void {
    print("🧪 Testing visible overlay creation...");
    
    // Create a test overlay at a fixed position
    const testObject = global.scene.createSceneObject("TestOverlay");
    const renderMesh = testObject.createComponent("Component.RenderMeshVisual");
    
    // Try to assign mesh if available
    if (this.highlightMesh && this.highlightMesh.mesh) {
      renderMesh.mesh = this.highlightMesh.mesh;
      print("✅ Test overlay has mesh: " + this.highlightMesh.mesh.name);
    } else {
      print("❌ Test overlay has NO mesh - will be invisible");
      print("💡 Please assign a SceneObject with RenderMeshVisual to the Highlight Mesh field");
    }
    
    // Assign material
    if (this.highlightMaterial) {
      renderMesh.mainMaterial = this.highlightMaterial.clone();
      const material = renderMesh.mainMaterial;
      material.mainPass.baseColor = new vec4(0, 1, 0, 1); // Bright green
      print("✅ Test overlay has green material");
    } else {
      print("❌ Test overlay has NO material");
    }
    
    // Position it in front of the camera
    testObject.getTransform().setWorldPosition(new vec3(0, 0, -1));
    testObject.getTransform().setLocalScale(new vec3(0.1, 0.1, 0.1));
    
    print("🎯 Test overlay created at position (0, 0, -1)");
    print("💡 Look for a green sphere in front of the camera");
  }
}
