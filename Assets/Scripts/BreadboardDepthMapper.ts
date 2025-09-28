import { BreadboardHole } from "./BreadboardAssistant";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

// Depth information structure
interface DepthInfo {
  depth: number; // Distance in meters
  confidence: number; // 0-1 confidence in depth measurement
  isValid: boolean; // Whether the depth reading is valid
}

// 3D positioning result
interface PositioningResult {
  worldPosition: vec3;
  confidence: number;
  depthInfo?: DepthInfo;
  fallbackUsed: boolean;
}

// Breadboard calibration data
interface BreadboardCalibration {
  centerPosition: vec3;
  width: number; // Physical width in meters
  height: number; // Physical height in meters
  rotation: quat;
  isCalibrated: boolean;
}

@component
export class BreadboardDepthMapper extends BaseScriptComponent {
  @ui.separator
  @ui.label("Depth API Integration for Accurate 3D Positioning")
  @ui.separator
  @ui.group_start("Depth API Settings")
  @input
  private enableDepthAPI: boolean = true;
  @input
  private depthConfidenceThreshold: number = 0.7; // Minimum confidence for depth readings
  @input
  private maxDepthDistance: number = 2.0; // Maximum depth in meters
  @input
  private minDepthDistance: number = 0.1; // Minimum depth in meters
  @ui.group_end
  @ui.separator
  @ui.group_start("Breadboard Calibration")
  @input
  private breadboardWidth: number = 0.2; // 20cm wide breadboard
  @input
  private breadboardHeight: number = 0.15; // 15cm tall breadboard
  @input
  private calibrationDistance: number = 0.5; // Default distance from camera
  @input
  private autoCalibrate: boolean = true;
  @ui.group_end
  @ui.separator
  @ui.group_start("Fallback Settings")
  @input
  private useFallbackPositioning: boolean = true;
  @input
  private fallbackDistance: number = 0.5; // Fallback distance in meters
  @input
  private enablePositionSmoothing: boolean = true;
  @input
  private smoothingFactor: number = 0.1; // 0-1, higher = more smoothing
  @ui.group_end

  // Depth API state
  public isDepthAPIEnabled: boolean = false;
  private depthSystem: any = null;
  private calibrationData: BreadboardCalibration;
  private positionHistory: Map<string, vec3[]> = new Map();
  private maxHistorySize: number = 10;

  // Events
  public depthAPIIitializedEvent: Event<boolean> = new Event<boolean>();
  public calibrationUpdatedEvent: Event<BreadboardCalibration> = new Event<BreadboardCalibration>();
  public positioningResultEvent: Event<PositioningResult> = new Event<PositioningResult>();

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
    this.initializeCalibration();
  }

  private onStart() {
    this.initializeDepthAPI();
  }

  private initializeCalibration() {
    this.calibrationData = {
      centerPosition: new vec3(0, 0, this.calibrationDistance),
      width: this.breadboardWidth,
      height: this.breadboardHeight,
      rotation: new quat(0, 0, 0, 1),
      isCalibrated: false
    };
  }

  private initializeDepthAPI() {
    try {
      // Check if depth system is available (using try-catch for safety)
      try {
        // Try to access the depth system
        if ((global as any).depthSystem) {
          this.depthSystem = (global as any).depthSystem;
          this.isDepthAPIEnabled = true;
          print("Depth API initialized successfully - Spectacles depth system available");
        } else {
          // Check if we're on Spectacles device
          if (global.deviceInfoSystem && global.deviceInfoSystem.isSpectacles && global.deviceInfoSystem.isSpectacles()) {
            this.isDepthAPIEnabled = true;
            print("Spectacles device detected - depth API enabled (system will be available at runtime)");
          } else {
            this.isDepthAPIEnabled = false;
            print("Non-Spectacles device - depth API not available");
          }
        }
        
        // Set up depth system configuration
        this.configureDepthSystem();
        
        this.depthAPIIitializedEvent.invoke(true);
      } catch (innerError) {
        print("Depth API not available, using fallback positioning");
        this.isDepthAPIEnabled = false;
        this.depthAPIIitializedEvent.invoke(false);
      }
    } catch (error) {
      print("Failed to initialize depth API: " + error);
      this.isDepthAPIEnabled = false;
      this.depthAPIIitializedEvent.invoke(false);
    }
  }

  private configureDepthSystem() {
    if (!this.depthSystem) return;

    try {
      // Configure depth system settings
      this.depthSystem.setMaxDepth(this.maxDepthDistance);
      this.depthSystem.setMinDepth(this.minDepthDistance);
      this.depthSystem.setConfidenceThreshold(this.depthConfidenceThreshold);
      
      print("Depth system configured successfully");
    } catch (error) {
      print("Failed to configure depth system: " + error);
    }
  }

  // Convert 2D breadboard coordinates to 3D world position using depth API
  public mapBreadboardToWorldPosition(breadboardX: number, breadboardY: number): PositioningResult {
    // Convert from 0-1000 grid to normalized coordinates (-1 to 1)
    const normalizedX = (breadboardX - 500) / 500;
    const normalizedY = (breadboardY - 500) / 500;

    // Convert to screen coordinates (0 to 1)
    const screenX = normalizedX * 0.5 + 0.5;
    const screenY = normalizedY * 0.5 + 0.5;

    let worldPosition: vec3;
    let confidence: number = 1.0;
    let depthInfo: DepthInfo | undefined;
    let fallbackUsed: boolean = false;

    // Try to get depth information
    if (this.isDepthAPIEnabled && this.depthSystem) {
      try {
        const depth = this.depthSystem.getDepthAtScreenPosition(screenX, screenY);
        
        if (depth && depth.depth > 0 && depth.confidence >= this.depthConfidenceThreshold) {
          // Use depth API for accurate positioning
          worldPosition = this.calculateWorldPositionFromDepth(normalizedX, normalizedY, depth.depth);
          confidence = depth.confidence;
          depthInfo = {
            depth: depth.depth,
            confidence: depth.confidence,
            isValid: true
          };
        } else {
          // Depth reading not reliable, use fallback
          worldPosition = this.calculateFallbackPosition(normalizedX, normalizedY);
          confidence = 0.5; // Lower confidence for fallback
          fallbackUsed = true;
          depthInfo = {
            depth: this.fallbackDistance,
            confidence: 0.3,
            isValid: false
          };
        }
      } catch (error) {
        print("Depth API error: " + error);
        worldPosition = this.calculateFallbackPosition(normalizedX, normalizedY);
        confidence = 0.3;
        fallbackUsed = true;
      }
    } else {
      // Use fallback positioning
      worldPosition = this.calculateFallbackPosition(normalizedX, normalizedY);
      confidence = 0.4;
      fallbackUsed = true;
    }

    // Apply position smoothing if enabled
    if (this.enablePositionSmoothing) {
      worldPosition = this.applyPositionSmoothing(breadboardX, breadboardY, worldPosition);
    }

    const result: PositioningResult = {
      worldPosition,
      confidence,
      depthInfo,
      fallbackUsed
    };

    this.positioningResultEvent.invoke(result);
    return result;
  }

  private calculateWorldPositionFromDepth(normalizedX: number, normalizedY: number, depth: number): vec3 {
    // Calculate world position using depth and calibration data
    const worldX = normalizedX * this.calibrationData.width * 0.5;
    const worldY = normalizedY * this.calibrationData.height * 0.5;
    const worldZ = depth;

    return new vec3(worldX, worldY, worldZ);
  }

  private calculateFallbackPosition(normalizedX: number, normalizedY: number): vec3 {
    // Use calibration data or default distance for fallback
    const distance = this.calibrationData.isCalibrated ? 
      this.calibrationData.centerPosition.z : 
      this.fallbackDistance;

    const worldX = normalizedX * this.breadboardWidth * 0.5;
    const worldY = normalizedY * this.breadboardHeight * 0.5;
    const worldZ = distance;

    return new vec3(worldX, worldY, worldZ);
  }

  private applyPositionSmoothing(breadboardX: number, breadboardY: number, newPosition: vec3): vec3 {
    const key = `${breadboardX}_${breadboardY}`;
    
    if (!this.positionHistory.has(key)) {
      this.positionHistory.set(key, []);
    }

    const history = this.positionHistory.get(key)!;
    history.push(newPosition);

    // Limit history size
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    // Calculate smoothed position
    if (history.length === 1) {
      return newPosition;
    }

    const smoothedPosition = vec3.zero();
    let totalWeight = 0;

    for (let i = 0; i < history.length; i++) {
      const weight = Math.pow(this.smoothingFactor, history.length - 1 - i);
      smoothedPosition.x += history[i].x * weight;
      smoothedPosition.y += history[i].y * weight;
      smoothedPosition.z += history[i].z * weight;
      totalWeight += weight;
    }

    smoothedPosition.x /= totalWeight;
    smoothedPosition.y /= totalWeight;
    smoothedPosition.z /= totalWeight;

    return smoothedPosition;
  }

  // Calibrate breadboard position using depth API
  public calibrateBreadboardPosition(): boolean {
    if (!this.isDepthAPIEnabled || !this.depthSystem) {
      print("Cannot calibrate: Depth API not available");
      return false;
    }

    try {
      // Sample multiple points on the breadboard to determine position
      const samplePoints = [
        { x: 0.5, y: 0.5 }, // Center
        { x: 0.25, y: 0.25 }, // Top-left
        { x: 0.75, y: 0.25 }, // Top-right
        { x: 0.25, y: 0.75 }, // Bottom-left
        { x: 0.75, y: 0.75 }  // Bottom-right
      ];

      const depths: number[] = [];
      let validSamples = 0;

      for (const point of samplePoints) {
        const depth = this.depthSystem.getDepthAtScreenPosition(point.x, point.y);
        if (depth && depth.depth > 0 && depth.confidence >= this.depthConfidenceThreshold) {
          depths.push(depth.depth);
          validSamples++;
        }
      }

      if (validSamples >= 3) {
        // Calculate average depth
        const averageDepth = depths.reduce((sum, depth) => sum + depth, 0) / depths.length;
        
        // Update calibration data
        this.calibrationData.centerPosition = new vec3(0, 0, averageDepth);
        this.calibrationData.isCalibrated = true;

        print(`Breadboard calibrated at depth: ${averageDepth}m`);
        this.calibrationUpdatedEvent.invoke(this.calibrationData);
        return true;
      } else {
        print("Insufficient valid depth samples for calibration");
        return false;
      }
    } catch (error) {
      print("Calibration failed: " + error);
      return false;
    }
  }

  // Get depth information at a specific screen position
  public getDepthAtPosition(screenX: number, screenY: number): DepthInfo | null {
    if (!this.isDepthAPIEnabled) {
      return null;
    }

    // Try to get depth system if not already available
    if (!this.depthSystem && (global as any).depthSystem) {
      this.depthSystem = (global as any).depthSystem;
      this.configureDepthSystem();
    }

    if (!this.depthSystem) {
      return null;
    }

    try {
      const depth = this.depthSystem.getDepthAtScreenPosition(screenX, screenY);
      
      if (depth && depth.depth > 0) {
        return {
          depth: depth.depth,
          confidence: depth.confidence || 0.5,
          isValid: depth.confidence >= this.depthConfidenceThreshold
        };
      }
    } catch (error) {
      print("Error getting depth: " + error);
    }

    return null;
  }

  // Update calibration data manually
  public updateCalibration(centerPosition: vec3, width: number, height: number, rotation?: quat): void {
    this.calibrationData.centerPosition = centerPosition;
    this.calibrationData.width = width;
    this.calibrationData.height = height;
    this.calibrationData.rotation = rotation || new quat(0, 0, 0, 1);
    this.calibrationData.isCalibrated = true;

    this.calibrationUpdatedEvent.invoke(this.calibrationData);
    print("Calibration updated manually");
  }

  // Get current calibration data
  public getCalibrationData(): BreadboardCalibration {
    return this.calibrationData;
  }

  // Check if depth API is available and working
  public isDepthAPIAvailable(): boolean {
    return this.isDepthAPIEnabled && this.depthSystem !== null;
  }

  // Clear position history
  public clearPositionHistory(): void {
    this.positionHistory.clear();
  }

  // Get position history for debugging
  public getPositionHistory(breadboardX: number, breadboardY: number): vec3[] {
    const key = `${breadboardX}_${breadboardY}`;
    return this.positionHistory.get(key) || [];
  }

  // Public method to map multiple breadboard holes at once
  public mapMultipleHoles(holes: BreadboardHole[]): PositioningResult[] {
    return holes.map(hole => this.mapBreadboardToWorldPosition(hole.x, hole.y));
  }

  // Method to get optimal positioning for circuit components
  public getOptimalComponentPositions(components: any[]): PositioningResult[] {
    const positions: PositioningResult[] = [];
    
    // Calculate optimal spacing between components
    const spacing = this.breadboardWidth / (components.length + 1);
    
    components.forEach((component, index) => {
      const breadboardX = 200 + (index * spacing * 1000 / this.breadboardWidth);
      const breadboardY = 500; // Center vertically
      
      const position = this.mapBreadboardToWorldPosition(breadboardX, breadboardY);
      positions.push(position);
    });

    return positions;
  }
}
