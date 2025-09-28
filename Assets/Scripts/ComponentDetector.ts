import { DetectedComponent, ComponentType } from "./BreadboardAssistant";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

// Component detection modes
enum DetectionMode {
  ResistorOnly = "resistor_only",
  OpAmpOnly = "op_amp_only",
  AllComponents = "all_components",
  CircuitSpecific = "circuit_specific"
}

// Resistor color code information
interface ResistorColorCode {
  color: string;
  digit: number;
  multiplier: number;
  tolerance: number;
}

// Op amp pin configuration
interface OpAmpPinConfig {
  pinNumber: number;
  pinName: string;
  function: string;
  isPower: boolean;
  isInput: boolean;
  isOutput: boolean;
}

// Component detection result
interface ComponentDetectionResult {
  component: DetectedComponent;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  additionalInfo?: any;
}

// Detection settings
interface DetectionSettings {
  enableResistorDetection: boolean;
  enableOpAmpDetection: boolean;
  enableWireDetection: boolean;
  enableBreadboardDetection: boolean;
  minConfidenceThreshold: number;
  maxDetectionDistance: number;
  enableColorCodeReading: boolean;
  enablePinIdentification: boolean;
}

@component
export class ComponentDetector extends BaseScriptComponent {
  @ui.separator
  @ui.label("Advanced Component Detection and Identification")
  @ui.separator
  @ui.group_start("Detection Settings")
  @input
  private detectionMode: string = DetectionMode.AllComponents;
  @input
  private minConfidenceThreshold: number = 0.7;
  @input
  private enableColorCodeReading: boolean = true;
  @input
  private enablePinIdentification: boolean = true;
  @ui.group_end
  @ui.separator
  @ui.group_start("Resistor Detection")
  @input
  private enableResistorDetection: boolean = true;
  @input
  private enableColorCodeParsing: boolean = true;
  @input
  private supportedResistorTypes: string = "axial,smd,through_hole";
  @ui.group_end
  @ui.separator
  @ui.group_start("Op Amp Detection")
  @input
  private enableOpAmpDetection: boolean = true;
  @input
  private supportedOpAmpPackages: string = "dip8,soic8,to99";
  @input
  private enablePinMapping: boolean = true;
  @ui.group_end

  // Detection state
  private detectedComponents: Map<string, ComponentDetectionResult> = new Map();
  private detectionHistory: ComponentDetectionResult[] = [];
  private detectionActive: boolean = false;

  // Color code mapping for resistors
  private colorCodeMap: Map<string, ResistorColorCode> = new Map([
    ["black", { color: "black", digit: 0, multiplier: 1, tolerance: 0 }],
    ["brown", { color: "brown", digit: 1, multiplier: 10, tolerance: 1 }],
    ["red", { color: "red", digit: 2, multiplier: 100, tolerance: 2 }],
    ["orange", { color: "orange", digit: 3, multiplier: 1000, tolerance: 0 }],
    ["yellow", { color: "yellow", digit: 4, multiplier: 10000, tolerance: 5 }],
    ["green", { color: "green", digit: 5, multiplier: 100000, tolerance: 0.5 }],
    ["blue", { color: "blue", digit: 6, multiplier: 1000000, tolerance: 0.25 }],
    ["violet", { color: "violet", digit: 7, multiplier: 10000000, tolerance: 0.1 }],
    ["gray", { color: "gray", digit: 8, multiplier: 100000000, tolerance: 0.05 }],
    ["white", { color: "white", digit: 9, multiplier: 1000000000, tolerance: 0 }],
    ["gold", { color: "gold", digit: 0, multiplier: 0.1, tolerance: 5 }],
    ["silver", { color: "silver", digit: 0, multiplier: 0.01, tolerance: 10 }]
  ]);

  // Common op amp pin configurations
  private opAmpPinConfigs: Map<string, OpAmpPinConfig[]> = new Map([
    ["dip8", [
      { pinNumber: 1, pinName: "OUT", function: "Output", isPower: false, isInput: false, isOutput: true },
      { pinNumber: 2, pinName: "IN-", function: "Inverting Input", isPower: false, isInput: true, isOutput: false },
      { pinNumber: 3, pinName: "IN+", function: "Non-inverting Input", isPower: false, isInput: true, isOutput: false },
      { pinNumber: 4, pinName: "V-", function: "Negative Supply", isPower: true, isInput: false, isOutput: false },
      { pinNumber: 5, pinName: "NC", function: "No Connection", isPower: false, isInput: false, isOutput: false },
      { pinNumber: 6, pinName: "NC", function: "No Connection", isPower: false, isInput: false, isOutput: false },
      { pinNumber: 7, pinName: "V+", function: "Positive Supply", isPower: true, isInput: false, isOutput: false },
      { pinNumber: 8, pinName: "NC", function: "No Connection", isPower: false, isInput: false, isOutput: false }
    ]],
    ["soic8", [
      { pinNumber: 1, pinName: "OUT", function: "Output", isPower: false, isInput: false, isOutput: true },
      { pinNumber: 2, pinName: "IN-", function: "Inverting Input", isPower: false, isInput: true, isOutput: false },
      { pinNumber: 3, pinName: "IN+", function: "Non-inverting Input", isPower: false, isInput: true, isOutput: false },
      { pinNumber: 4, pinName: "V-", function: "Negative Supply", isPower: true, isInput: false, isOutput: false },
      { pinNumber: 5, pinName: "NC", function: "No Connection", isPower: false, isInput: false, isOutput: false },
      { pinNumber: 6, pinName: "NC", function: "No Connection", isPower: false, isInput: false, isOutput: false },
      { pinNumber: 7, pinName: "V+", function: "Positive Supply", isPower: true, isInput: false, isOutput: false },
      { pinNumber: 8, pinName: "NC", function: "No Connection", isPower: false, isInput: false, isOutput: false }
    ]]
  ]);

  // Events
  public componentDetectedEvent: Event<ComponentDetectionResult> = new Event<ComponentDetectionResult>();
  public resistorDetectedEvent: Event<{ component: DetectedComponent; value: string; colorCode: string[] }> = new Event<{ component: DetectedComponent; value: string; colorCode: string[] }>();
  public opAmpDetectedEvent: Event<{ component: DetectedComponent; pins: OpAmpPinConfig[]; package: string }> = new Event<{ component: DetectedComponent; pins: OpAmpPinConfig[]; package: string }>();
  public detectionErrorEvent: Event<string> = new Event<string>();

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private onStart() {
    print("Component Detector initialized");
  }

  // Main detection method - called by Gemini assistant
  public detectComponent(
    componentType: ComponentType,
    position: { x: number; y: number },
    confidence: number,
    boundingBox: { x: number; y: number; width: number; height: number },
    additionalData?: any
  ): ComponentDetectionResult | null {
    try {
      const component: DetectedComponent = {
        type: componentType,
        position: position,
        confidence: confidence,
        boundingBox: boundingBox
      };

      // Process based on component type
      let result: ComponentDetectionResult;

      switch (componentType) {
        case ComponentType.Resistor:
          result = this.processResistorDetection(component, additionalData);
          break;
        case ComponentType.OpAmp:
          result = this.processOpAmpDetection(component, additionalData);
          break;
        case ComponentType.Breadboard:
          result = this.processBreadboardDetection(component, additionalData);
          break;
        case ComponentType.Wire:
          result = this.processWireDetection(component, additionalData);
          break;
        default:
          result = this.processGenericDetection(component, additionalData);
          break;
      }

      if (result && result.confidence >= this.minConfidenceThreshold) {
        this.addDetectionResult(result);
        this.componentDetectedEvent.invoke(result);
        return result;
      }

      return null;
    } catch (error) {
      this.detectionErrorEvent.invoke("Detection error: " + error);
      return null;
    }
  }

  // Process resistor detection
  private processResistorDetection(component: DetectedComponent, additionalData?: any): ComponentDetectionResult {
    let value = "";
    let colorCode: string[] = [];

    if (this.enableColorCodeReading && additionalData?.colorCode) {
      // Parse color code from Gemini detection
      colorCode = additionalData.colorCode;
      value = this.parseColorCode(colorCode);
    } else if (additionalData?.printedValue) {
      // Use printed value if available
      value = additionalData.printedValue;
    } else {
      // Default value if no specific detection
      value = "Unknown";
    }

    component.value = value;

    const result: ComponentDetectionResult = {
      component: component,
      confidence: component.confidence,
      boundingBox: component.boundingBox!,
      additionalInfo: {
        colorCode: colorCode,
        printedValue: additionalData?.printedValue,
        packageType: additionalData?.packageType || "axial"
      }
    };

    // Trigger resistor-specific event
    this.resistorDetectedEvent.invoke({
      component: component,
      value: value,
      colorCode: colorCode
    });

    return result;
  }

  // Process op amp detection
  private processOpAmpDetection(component: DetectedComponent, additionalData?: any): ComponentDetectionResult {
    let pins: OpAmpPinConfig[] = [];
    let packageType = "dip8"; // Default package

    if (this.enablePinIdentification && additionalData?.packageType) {
      packageType = additionalData.packageType;
      pins = this.opAmpPinConfigs.get(packageType) || this.opAmpPinConfigs.get("dip8")!;
    } else {
      pins = this.opAmpPinConfigs.get("dip8")!;
    }

    component.pins = pins.map(pin => pin.pinName);

    const result: ComponentDetectionResult = {
      component: component,
      confidence: component.confidence,
      boundingBox: component.boundingBox!,
      additionalInfo: {
        pins: pins,
        packageType: packageType,
        partNumber: additionalData?.partNumber
      }
    };

    // Trigger op amp-specific event
    this.opAmpDetectedEvent.invoke({
      component: component,
      pins: pins,
      package: packageType
    });

    return result;
  }

  // Process breadboard detection
  private processBreadboardDetection(component: DetectedComponent, additionalData?: any): ComponentDetectionResult {
    const result: ComponentDetectionResult = {
      component: component,
      confidence: component.confidence,
      boundingBox: component.boundingBox!,
      additionalInfo: {
        holePattern: additionalData?.holePattern,
        dimensions: additionalData?.dimensions
      }
    };

    return result;
  }

  // Process wire detection
  private processWireDetection(component: DetectedComponent, additionalData?: any): ComponentDetectionResult {
    const result: ComponentDetectionResult = {
      component: component,
      confidence: component.confidence,
      boundingBox: component.boundingBox!,
      additionalInfo: {
        color: additionalData?.color,
        length: additionalData?.length,
        gauge: additionalData?.gauge
      }
    };

    return result;
  }

  // Process generic component detection
  private processGenericDetection(component: DetectedComponent, additionalData?: any): ComponentDetectionResult {
    const result: ComponentDetectionResult = {
      component: component,
      confidence: component.confidence,
      boundingBox: component.boundingBox!,
      additionalInfo: additionalData
    };

    return result;
  }

  // Parse resistor color code to value
  private parseColorCode(colorCode: string[]): string {
    if (colorCode.length < 3) {
      return "Invalid color code";
    }

    try {
      // Standard 4-band resistor: [digit1, digit2, multiplier, tolerance]
      const digit1 = this.colorCodeMap.get(colorCode[0])?.digit || 0;
      const digit2 = this.colorCodeMap.get(colorCode[1])?.digit || 0;
      const multiplier = this.colorCodeMap.get(colorCode[2])?.multiplier || 1;
      const tolerance = this.colorCodeMap.get(colorCode[3])?.tolerance || 5;

      const resistance = (digit1 * 10 + digit2) * multiplier;
      
      // Format the value with appropriate units
      if (resistance >= 1000000) {
        return `${(resistance / 1000000).toFixed(1)}MΩ ±${tolerance}%`;
      } else if (resistance >= 1000) {
        return `${(resistance / 1000).toFixed(1)}kΩ ±${tolerance}%`;
      } else {
        return `${resistance}Ω ±${tolerance}%`;
      }
    } catch (error) {
      return "Color code parsing error";
    }
  }

  // Add detection result to history
  private addDetectionResult(result: ComponentDetectionResult): void {
    const componentId = `${result.component.type}_${result.component.position.x}_${result.component.position.y}`;
    this.detectedComponents.set(componentId, result);
    this.detectionHistory.push(result);

    // Limit history size
    if (this.detectionHistory.length > 50) {
      this.detectionHistory.shift();
    }
  }

  // Get detected components by type
  public getDetectedComponentsByType(type: ComponentType): DetectedComponent[] {
    const components: DetectedComponent[] = [];
    
    this.detectedComponents.forEach((result) => {
      if (result.component.type === type) {
        components.push(result.component);
      }
    });

    return components;
  }

  // Get all detected components
  public getAllDetectedComponents(): DetectedComponent[] {
    const components: DetectedComponent[] = [];
    
    this.detectedComponents.forEach((result) => {
      components.push(result.component);
    });

    return components;
  }

  // Get detection result for a specific component
  public getDetectionResult(componentId: string): ComponentDetectionResult | undefined {
    return this.detectedComponents.get(componentId);
  }

  // Clear all detections
  public clearDetections(): void {
    this.detectedComponents.clear();
    this.detectionHistory = [];
  }

  // Remove a specific detection
  public removeDetection(componentId: string): boolean {
    return this.detectedComponents.delete(componentId);
  }

  // Get detection statistics
  public getDetectionStats(): { total: number; byType: Map<ComponentType, number>; averageConfidence: number } {
    const byType = new Map<ComponentType, number>();
    let totalConfidence = 0;
    let count = 0;

    this.detectedComponents.forEach((result) => {
      const type = result.component.type;
      byType.set(type, (byType.get(type) || 0) + 1);
      totalConfidence += result.confidence;
      count++;
    });

    return {
      total: this.detectedComponents.size,
      byType: byType,
      averageConfidence: count > 0 ? totalConfidence / count : 0
    };
  }

  // Validate component detection
  public validateDetection(result: ComponentDetectionResult): boolean {
    // Check confidence threshold
    if (result.confidence < this.minConfidenceThreshold) {
      return false;
    }

    // Check bounding box validity
    if (!result.boundingBox || result.boundingBox.width <= 0 || result.boundingBox.height <= 0) {
      return false;
    }

    // Check position validity
    if (result.component.position.x < 0 || result.component.position.x > 1000 ||
        result.component.position.y < 0 || result.component.position.y > 1000) {
      return false;
    }

    return true;
  }

  // Get op amp pin configuration
  public getOpAmpPinConfig(packageType: string): OpAmpPinConfig[] {
    return this.opAmpPinConfigs.get(packageType) || this.opAmpPinConfigs.get("dip8")!;
  }

  // Get resistor color code information
  public getResistorColorCode(color: string): ResistorColorCode | undefined {
    return this.colorCodeMap.get(color.toLowerCase());
  }

  // Check if detection is active
  public isDetectionActive(): boolean {
    return this.detectionActive;
  }

  // Set detection active state
  public setDetectionActive(active: boolean): void {
    this.detectionActive = active;
  }

  // Get detection history
  public getDetectionHistory(): ComponentDetectionResult[] {
    return [...this.detectionHistory];
  }

  // Filter detections by confidence
  public getHighConfidenceDetections(minConfidence: number = 0.8): ComponentDetectionResult[] {
    const results: ComponentDetectionResult[] = [];
    
    this.detectedComponents.forEach((result) => {
      if (result.confidence >= minConfidence) {
        results.push(result);
      }
    });

    return results;
  }
}
