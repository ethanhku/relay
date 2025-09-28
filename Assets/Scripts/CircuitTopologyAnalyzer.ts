import { DetectedComponent, ComponentType, BreadboardHole } from "./BreadboardAssistant";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

// Circuit topology types
enum CircuitType {
  NonInvertingOpAmp = "non_inverting_op_amp",
  InvertingOpAmp = "inverting_op_amp",
  VoltageDivider = "voltage_divider",
  LowPassFilter = "low_pass_filter",
  HighPassFilter = "high_pass_filter",
  Unknown = "unknown"
}

// Circuit connection types
enum ConnectionType {
  Input = "input",
  Output = "output",
  Power = "power",
  Ground = "ground",
  Feedback = "feedback",
  Signal = "signal"
}

// Circuit connection
interface CircuitConnection {
  fromComponent: DetectedComponent;
  toComponent: DetectedComponent;
  connectionType: ConnectionType;
  fromPin?: string;
  toPin?: string;
  confidence: number;
}

// Circuit analysis result
interface CircuitAnalysisResult {
  circuitType: CircuitType;
  components: DetectedComponent[];
  connections: CircuitConnection[];
  completeness: number; // 0-1, how complete the circuit is
  missingComponents: string[];
  errors: string[];
  isValid: boolean;
  gain?: number; // For op amp circuits
  bandwidth?: number; // For filter circuits
}

// Non-inverting op amp specific analysis
interface NonInvertingOpAmpAnalysis {
  inputResistor: DetectedComponent;
  feedbackResistor: DetectedComponent;
  opAmp: DetectedComponent;
  inputConnection: CircuitConnection;
  feedbackConnection: CircuitConnection;
  outputConnection: CircuitConnection;
  powerConnections: CircuitConnection[];
  groundConnections: CircuitConnection[];
  calculatedGain: number;
  isComplete: boolean;
}

@component
export class CircuitTopologyAnalyzer extends BaseScriptComponent {
  @ui.separator
  @ui.label("Circuit Topology Analysis Engine")
  @ui.separator
  @ui.group_start("Analysis Settings")
  @input
  private enableRealTimeAnalysis: boolean = true;
  @input
  private analysisConfidenceThreshold: number = 0.7;
  @input
  private maxConnectionDistance: number = 50; // Maximum distance for connections in breadboard units
  @input
  private enableGainCalculation: boolean = true;
  @ui.group_end
  @ui.separator
  @ui.group_start("Circuit Recognition")
  @input
  private targetCircuitType: string = CircuitType.NonInvertingOpAmp;
  @input
  private enableAutoDetection: boolean = true;
  @input
  private requirePowerConnections: boolean = true;
  @ui.group_end

  // Analysis state
  private detectedComponents: DetectedComponent[] = [];
  private detectedConnections: CircuitConnection[] = [];
  private currentAnalysis: CircuitAnalysisResult | null = null;
  private analysisHistory: CircuitAnalysisResult[] = [];

  // Events
  public circuitDetectedEvent: Event<CircuitAnalysisResult> = new Event<CircuitAnalysisResult>();
  public topologyUpdatedEvent: Event<CircuitAnalysisResult> = new Event<CircuitAnalysisResult>();
  public connectionDetectedEvent: Event<CircuitConnection> = new Event<CircuitConnection>();
  public analysisErrorEvent: Event<string> = new Event<string>();

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  private onStart() {
    print("Circuit Topology Analyzer initialized");
  }

  // Add a detected component for analysis
  public addComponent(component: DetectedComponent): void {
    this.detectedComponents.push(component);
    
    if (this.enableRealTimeAnalysis) {
      this.performRealTimeAnalysis();
    }
  }

  // Remove a component
  public removeComponent(componentId: string): void {
    this.detectedComponents = this.detectedComponents.filter(c => c.type !== componentId);
    
    if (this.enableRealTimeAnalysis) {
      this.performRealTimeAnalysis();
    }
  }

  // Clear all components and reset analysis
  public clearComponents(): void {
    this.detectedComponents = [];
    this.detectedConnections = [];
    this.currentAnalysis = null;
    this.analysisHistory = [];
  }

  // Perform real-time circuit analysis
  private performRealTimeAnalysis(): void {
    try {
      const analysis = this.analyzeCircuitTopology();
      this.currentAnalysis = analysis;
      this.analysisHistory.push(analysis);
      
      // Limit history size
      if (this.analysisHistory.length > 10) {
        this.analysisHistory.shift();
      }

      this.topologyUpdatedEvent.invoke(analysis);
      
      // Check if circuit is complete
      if (analysis.completeness >= 0.8 && analysis.isValid) {
        this.circuitDetectedEvent.invoke(analysis);
      }
    } catch (error) {
      this.analysisErrorEvent.invoke("Analysis error: " + error);
    }
  }

  // Main circuit topology analysis
  private analyzeCircuitTopology(): CircuitAnalysisResult {
    const result: CircuitAnalysisResult = {
      circuitType: CircuitType.Unknown,
      components: [...this.detectedComponents],
      connections: [],
      completeness: 0,
      missingComponents: [],
      errors: [],
      isValid: false
    };

    // Detect circuit type
    result.circuitType = this.detectCircuitType();
    
    // Analyze based on circuit type
    switch (result.circuitType) {
      case CircuitType.NonInvertingOpAmp:
        this.analyzeNonInvertingOpAmp(result);
        break;
      case CircuitType.InvertingOpAmp:
        this.analyzeInvertingOpAmp(result);
        break;
      case CircuitType.VoltageDivider:
        this.analyzeVoltageDivider(result);
        break;
      default:
        this.analyzeGenericCircuit(result);
        break;
    }

    return result;
  }

  // Detect the type of circuit based on components
  private detectCircuitType(): CircuitType {
    const resistors = this.detectedComponents.filter(c => c.type === ComponentType.Resistor);
    const opAmps = this.detectedComponents.filter(c => c.type === ComponentType.OpAmp);

    // Non-inverting op amp: 2 resistors + 1 op amp
    if (resistors.length >= 2 && opAmps.length >= 1) {
      return CircuitType.NonInvertingOpAmp;
    }

    // Inverting op amp: 2 resistors + 1 op amp (different topology)
    if (resistors.length >= 2 && opAmps.length >= 1) {
      return CircuitType.InvertingOpAmp;
    }

    // Voltage divider: 2 resistors
    if (resistors.length >= 2 && opAmps.length === 0) {
      return CircuitType.VoltageDivider;
    }

    return CircuitType.Unknown;
  }

  // Analyze non-inverting op amp circuit
  private analyzeNonInvertingOpAmp(result: CircuitAnalysisResult): void {
    const resistors = this.detectedComponents.filter(c => c.type === ComponentType.Resistor);
    const opAmps = this.detectedComponents.filter(c => c.type === ComponentType.OpAmp);

    if (resistors.length < 2) {
      result.missingComponents.push("feedback resistor");
      result.errors.push("Need at least 2 resistors for non-inverting op amp");
    }

    if (opAmps.length < 1) {
      result.missingComponents.push("operational amplifier");
      result.errors.push("Need an op amp for non-inverting amplifier");
    }

    // Identify input and feedback resistors
    const inputResistor = resistors[0];
    const feedbackResistor = resistors[1];
    const opAmp = opAmps[0];

    if (inputResistor && feedbackResistor && opAmp) {
      // Calculate connections
      const connections = this.calculateOpAmpConnections(inputResistor, feedbackResistor, opAmp);
      result.connections = connections;

      // Calculate gain if resistor values are available
      if (this.enableGainCalculation && inputResistor.value && feedbackResistor.value) {
        result.gain = this.calculateNonInvertingGain(inputResistor.value, feedbackResistor.value);
      }

      // Check completeness
      result.completeness = this.calculateCompleteness(result);
      result.isValid = result.completeness >= this.analysisConfidenceThreshold;
    }
  }

  // Analyze inverting op amp circuit
  private analyzeInvertingOpAmp(result: CircuitAnalysisResult): void {
    // Similar to non-inverting but with different topology
    const resistors = this.detectedComponents.filter(c => c.type === ComponentType.Resistor);
    const opAmps = this.detectedComponents.filter(c => c.type === ComponentType.OpAmp);

    if (resistors.length < 2 || opAmps.length < 1) {
      result.errors.push("Inverting op amp requires 2 resistors and 1 op amp");
      return;
    }

    const inputResistor = resistors[0];
    const feedbackResistor = resistors[1];
    const opAmp = opAmps[0];

    if (this.enableGainCalculation && inputResistor.value && feedbackResistor.value) {
      result.gain = this.calculateInvertingGain(inputResistor.value, feedbackResistor.value);
    }

    result.completeness = this.calculateCompleteness(result);
    result.isValid = result.completeness >= this.analysisConfidenceThreshold;
  }

  // Analyze voltage divider circuit
  private analyzeVoltageDivider(result: CircuitAnalysisResult): void {
    const resistors = this.detectedComponents.filter(c => c.type === ComponentType.Resistor);

    if (resistors.length < 2) {
      result.errors.push("Voltage divider requires at least 2 resistors");
      return;
    }

    const r1 = resistors[0];
    const r2 = resistors[1];

    if (this.enableGainCalculation && r1.value && r2.value) {
      result.gain = this.calculateVoltageDividerGain(r1.value, r2.value);
    }

    result.completeness = this.calculateCompleteness(result);
    result.isValid = result.completeness >= this.analysisConfidenceThreshold;
  }

  // Analyze generic circuit
  private analyzeGenericCircuit(result: CircuitAnalysisResult): void {
    result.completeness = this.detectedComponents.length / 5; // Assume 5 components for complete circuit
    result.isValid = result.completeness >= 0.5;
  }

  // Calculate connections for op amp circuit
  private calculateOpAmpConnections(
    inputResistor: DetectedComponent,
    feedbackResistor: DetectedComponent,
    opAmp: DetectedComponent
  ): CircuitConnection[] {
    const connections: CircuitConnection[] = [];

    // Input connection
    connections.push({
      fromComponent: inputResistor,
      toComponent: opAmp,
      connectionType: ConnectionType.Input,
      fromPin: "output",
      toPin: "IN+",
      confidence: 0.9
    });

    // Feedback connection
    connections.push({
      fromComponent: feedbackResistor,
      toComponent: opAmp,
      connectionType: ConnectionType.Feedback,
      fromPin: "input",
      toPin: "IN+",
      confidence: 0.9
    });

    // Output connection
    connections.push({
      fromComponent: opAmp,
      toComponent: feedbackResistor,
      connectionType: ConnectionType.Output,
      fromPin: "OUT",
      toPin: "output",
      confidence: 0.9
    });

    return connections;
  }

  // Calculate non-inverting op amp gain
  private calculateNonInvertingGain(inputResistorValue: string, feedbackResistorValue: string): number {
    try {
      const r1 = this.parseResistorValue(inputResistorValue);
      const r2 = this.parseResistorValue(feedbackResistorValue);
      
      if (r1 > 0 && r2 > 0) {
        return 1 + (r2 / r1);
      }
    } catch (error) {
      print("Error calculating gain: " + error);
    }
    
    return 1; // Default gain
  }

  // Calculate inverting op amp gain
  private calculateInvertingGain(inputResistorValue: string, feedbackResistorValue: string): number {
    try {
      const r1 = this.parseResistorValue(inputResistorValue);
      const r2 = this.parseResistorValue(feedbackResistorValue);
      
      if (r1 > 0 && r2 > 0) {
        return -(r2 / r1);
      }
    } catch (error) {
      print("Error calculating gain: " + error);
    }
    
    return -1; // Default gain
  }

  // Calculate voltage divider gain
  private calculateVoltageDividerGain(r1Value: string, r2Value: string): number {
    try {
      const r1 = this.parseResistorValue(r1Value);
      const r2 = this.parseResistorValue(r2Value);
      
      if (r1 > 0 && r2 > 0) {
        return r2 / (r1 + r2);
      }
    } catch (error) {
      print("Error calculating voltage divider gain: " + error);
    }
    
    return 0.5; // Default gain
  }

  // Parse resistor value string to numeric value
  private parseResistorValue(value: string): number {
    const cleanValue = value.toLowerCase().replace(/\s/g, '');
    
    if (cleanValue.includes('k')) {
      return parseFloat(cleanValue.replace('k', '')) * 1000;
    } else if (cleanValue.includes('m')) {
      return parseFloat(cleanValue.replace('m', '')) * 1000000;
    } else if (cleanValue.includes('ω') || cleanValue.includes('ohm')) {
      return parseFloat(cleanValue.replace(/[ωohm]/g, ''));
    } else {
      return parseFloat(cleanValue);
    }
  }

  // Calculate circuit completeness
  private calculateCompleteness(result: CircuitAnalysisResult): number {
    let completeness = 0;
    
    switch (result.circuitType) {
      case CircuitType.NonInvertingOpAmp:
        completeness = this.calculateOpAmpCompleteness(result);
        break;
      case CircuitType.InvertingOpAmp:
        completeness = this.calculateOpAmpCompleteness(result);
        break;
      case CircuitType.VoltageDivider:
        completeness = this.calculateVoltageDividerCompleteness(result);
        break;
      default:
        completeness = result.components.length / 5; // Generic calculation
        break;
    }

    return Math.min(completeness, 1.0);
  }

  // Calculate op amp circuit completeness
  private calculateOpAmpCompleteness(result: CircuitAnalysisResult): number {
    const resistors = result.components.filter(c => c.type === ComponentType.Resistor);
    const opAmps = result.components.filter(c => c.type === ComponentType.OpAmp);
    
    let score = 0;
    
    // Component presence (60% of score)
    if (resistors.length >= 2) score += 0.3;
    if (opAmps.length >= 1) score += 0.3;
    
    // Connection analysis (40% of score)
    if (result.connections.length >= 3) score += 0.4;
    
    return score;
  }

  // Calculate voltage divider completeness
  private calculateVoltageDividerCompleteness(result: CircuitAnalysisResult): number {
    const resistors = result.components.filter(c => c.type === ComponentType.Resistor);
    
    let score = 0;
    
    // Component presence (80% of score)
    if (resistors.length >= 2) score += 0.8;
    
    // Connection analysis (20% of score)
    if (result.connections.length >= 1) score += 0.2;
    
    return score;
  }

  // Get current analysis result
  public getCurrentAnalysis(): CircuitAnalysisResult | null {
    return this.currentAnalysis;
  }

  // Get analysis history
  public getAnalysisHistory(): CircuitAnalysisResult[] {
    return [...this.analysisHistory];
  }

  // Get detected components
  public getDetectedComponents(): DetectedComponent[] {
    return [...this.detectedComponents];
  }

  // Get detected connections
  public getDetectedConnections(): CircuitConnection[] {
    return [...this.detectedConnections];
  }

  // Check if circuit is complete
  public isCircuitComplete(): boolean {
    return this.currentAnalysis?.isValid && this.currentAnalysis.completeness >= this.analysisConfidenceThreshold;
  }

  // Get circuit type
  public getCircuitType(): CircuitType {
    return this.currentAnalysis?.circuitType || CircuitType.Unknown;
  }

  // Get circuit gain
  public getCircuitGain(): number | undefined {
    return this.currentAnalysis?.gain;
  }

  // Validate component placement for circuit topology
  public validateComponentPlacement(component: DetectedComponent, targetHole: BreadboardHole): boolean {
    if (!this.currentAnalysis) return true;

    // Check if component placement makes sense for current circuit topology
    switch (this.currentAnalysis.circuitType) {
      case CircuitType.NonInvertingOpAmp:
        return this.validateNonInvertingPlacement(component, targetHole);
      case CircuitType.InvertingOpAmp:
        return this.validateInvertingPlacement(component, targetHole);
      default:
        return true; // No specific validation for unknown circuits
    }
  }

  private validateNonInvertingPlacement(component: DetectedComponent, targetHole: BreadboardHole): boolean {
    // Basic validation for non-inverting op amp placement
    // This could be enhanced with more sophisticated rules
    return true;
  }

  private validateInvertingPlacement(component: DetectedComponent, targetHole: BreadboardHole): boolean {
    // Basic validation for inverting op amp placement
    return true;
  }
}
