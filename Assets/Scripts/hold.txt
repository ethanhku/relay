import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { BreadboardAssistant } from "./BreadboardAssistant";
import { BreadboardAROverlay } from "./BreadboardAROverlay";
import { SphereController } from "./SphereController";
import { LSTween } from "LSTween.lspkg/LSTween";
import Easing from "LSTween.lspkg/TweenJS/Easing";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { setTimeout, clearTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

// Simplified - just start/stop analysis

// UI state management
enum UIState {
  Initial = "initial",
  Analyzing = "analyzing",
  ShowingGuidance = "showing_guidance",
  CircuitComplete = "circuit_complete"
}

@component
export class BreadboardUIBridge extends BaseScriptComponent {
  @ui.separator
  @ui.label("Breadboard Circuit Assistant - Main UI Controller")
  @ui.separator
  @ui.group_start("Core Components")
  @input
  private breadboardAssistant: BreadboardAssistant;
  @input
  private arOverlay: BreadboardAROverlay;
  @input
  private sphereController: SphereController;
  @ui.group_end
  @ui.separator
  @ui.group_start("UI Elements")
  @input
  private startStopButton: PinchButton;
  @input
  private hintTitle: Text;
  @input
  private hintText: Text;
  @input
  private statusText: Text;
  @ui.group_end
  @ui.separator
  @ui.group_start("Analysis Settings")
  @input
  private showComponentLabels: boolean = true;
  @input
  private showConnectionLines: boolean = true;
  @ui.group_end

  // State management
  private currentUIState: UIState = UIState.Initial;
  private isAnalysisActive: boolean = false;
  private detectedComponentsCount: number = 0;
  private circuitTopologyComplete: boolean = false;
  private hasPressedButtonOnce: boolean = false;
  private revertTimeout: any = null;

  // Events
  public analysisCompletedEvent: Event<{ components: number; topologyComplete: boolean }> = new Event<{ components: number; topologyComplete: boolean }>();

  onAwake() {
    this.createEvent("OnStartEvent").bind(this.onStart.bind(this));
  }

  onDestroy() {
    // Clean up any pending timeouts
    if (this.revertTimeout) {
      clearTimeout(this.revertTimeout);
      this.revertTimeout = null;
    }
  }

  private onStart() {
    this.initializeUI();
    this.connectEvents();
    this.updateUIState(UIState.Initial);
  }

  private initializeUI() {
    // Set up single start/stop button
    this.startStopButton.onButtonPinched.add(() => {
      if (this.isAnalysisActive) {
        this.stopAnalysis();
      } else {
        this.startAnalysis();
      }
    });

    // Initialize text content
    this.hintTitle.text = "Relay Analysis";
    this.hintText.text = "Press button to start/stop analysis";
    this.statusText.text = "Ready for Relay analysis";

    // Update button text
    this.updateButtonText();
  }

  private connectEvents() {
    // Connect to breadboard assistant events
    this.breadboardAssistant.componentDetectedEvent.add((component) => {
      this.onComponentDetected(component);
    });

    this.breadboardAssistant.circuitCompleteEvent.add((topology) => {
      this.onCircuitComplete(topology);
    });

    this.breadboardAssistant.updateTextEvent.add((data) => {
      this.updateStatusText(data.text);
    });

    // Connect to AR overlay events
    this.arOverlay.overlayCreatedEvent.add((overlay) => {
      this.onOverlayCreated(overlay);
    });

    this.arOverlay.overlayRemovedEvent.add((overlayId) => {
      this.onOverlayRemoved(overlayId);
    });

    // Connect to sphere controller for activation
    this.sphereController.isActivatedEvent.add((isActivated) => {
      this.onSphereActivated(isActivated);
    });
  }

  private startAnalysis() {
    if (this.isAnalysisActive) {
      this.stopAnalysis();
      return;
    }

    // Clear any pending revert timeout since user is actively using the system
    if (this.revertTimeout) {
      clearTimeout(this.revertTimeout);
      this.revertTimeout = null;
      print("Cleared revert timeout - user is actively using system");
    }

    this.isAnalysisActive = true;
    this.updateUIState(UIState.Analyzing);

    // Start the breadboard assistant for circuit analysis
    this.breadboardAssistant.createGeminiLiveSession();
    this.breadboardAssistant.startAnalysis();

    // Update UI for Relay analysis mode
    this.updateStatusText("Analyzing Relay circuit...");
    
    // Hide hint text after first button press
    if (!this.hasPressedButtonOnce) {
      this.hasPressedButtonOnce = true;
      // Hide the hint text by making it invisible
      this.hintText.sceneObject.enabled = false;
    }

    // Update button text
    this.updateButtonText();
  }

  private stopAnalysis() {
    this.isAnalysisActive = false;
    this.breadboardAssistant.stopAnalysis();
    this.updateUIState(UIState.Initial);
    this.updateStatusText("Analysis stopped");
    
    // Start 10-second timeout to revert to original state
    this.startRevertTimeout();
    
    // Update button text
    this.updateButtonText();
  }

  private updateButtonText() {
    // PinchButton doesn't have text property - we'll use status text instead
    // The button state is managed by the analysis state
  }

  private startRevertTimeout() {
    // Clear any existing timeout
    if (this.revertTimeout) {
      clearTimeout(this.revertTimeout);
    }
    
    // Start 4-second timeout
    this.revertTimeout = setTimeout(() => {
      this.revertToOriginalState();
    }, 4000); // 4 seconds
    
    print("Started 4-second revert timeout");
  }

  private revertToOriginalState() {
    // Show hint text again
    this.hintText.sceneObject.enabled = true;
    this.hintText.text = "Press button to start/stop analysis";
    this.updateStatusText("Ready for Relay analysis");
    
    // Reset the flag so hint can be hidden again on next start
    this.hasPressedButtonOnce = false;
    
    print("Reverted to original state - hint text visible again");
  }

  private onComponentDetected(component: any) {
    this.detectedComponentsCount++;
    
    // Update status based on component type
    if (component.type === "breadboard") {
      this.updateStatusText(`Found breadboard at (${component.position.x}, ${component.position.y})`);
    } else if (component.type === "op_amp") {
      this.updateStatusText(`Found op amp at (${component.position.x}, ${component.position.y})`);
    } else {
      this.updateStatusText(`Detected ${component.type}${component.value ? ' (' + component.value + ')' : ''} - Total: ${this.detectedComponentsCount}`);
    }

    // Show component label if enabled
    if (this.showComponentLabels) {
      this.arOverlay.showComponentLabel(component);
    }

    // Check if we have breadboard and op amp (initial detection complete)
    const breadboard = this.breadboardAssistant.getDetectedComponents().find(c => c.type === "breadboard");
    const opAmp = this.breadboardAssistant.getDetectedComponents().find(c => c.type === "op_amp");
    
    if (breadboard && opAmp) {
      this.updateStatusText("Found breadboard and op amp. Ready for start instructions.");
      this.hintText.text = "Initial detection complete. Waiting for start instructions to begin circuit analysis.";
    }

    // Check if we have enough components for circuit analysis
    if (this.detectedComponentsCount >= 3) {
      this.performCircuitTopologyAnalysis();
    }
  }

  private onCircuitComplete(topology: any) {
    this.circuitTopologyComplete = true;
    this.updateUIState(UIState.CircuitComplete);
    
    // Show circuit topology visualization
    if (this.showConnectionLines) {
      this.arOverlay.showCircuitTopology(topology);
    }

    // Update status
    this.updateStatusText("Circuit topology complete! Non-inverting op amp detected.");
    this.hintText.text = "Circuit analysis complete. All components and connections identified.";

    // Trigger completion event
    this.analysisCompletedEvent.invoke({
      components: this.detectedComponentsCount,
      topologyComplete: true
    });
  }

  private performCircuitTopologyAnalysis() {
    this.updateUIState(UIState.ShowingGuidance);
    this.updateStatusText("Analyzing circuit topology...");
    
    // The actual analysis is handled by the Gemini assistant
    // This just updates the UI state
  }

  private onSphereActivated(isActivated: boolean) {
    if (this.isAnalysisActive) {
      if (isActivated) {
        this.breadboardAssistant.startAnalysis();
      } else {
        this.breadboardAssistant.stopAnalysis();
      }
    }
  }

  private onOverlayCreated(overlay: any) {
    // Log overlay creation for debugging
    print(`AR Overlay created: ${overlay.type} at (${overlay.position.x}, ${overlay.position.y}, ${overlay.position.z})`);
  }

  private onOverlayRemoved(overlayId: string) {
    // Log overlay removal for debugging
    print(`AR Overlay removed: ${overlayId}`);
  }

  // Removed old analysis mode methods - simplified to start/stop only

  private updateUIState(newState: UIState) {
    this.currentUIState = newState;
    
    // Keep the single start/stop button enabled and visible
    if (this.startStopButton) {
      this.startStopButton.enabled = true;
      this.startStopButton.sceneObject.enabled = true;
    }
  }

  // Removed hideButtons and showButtons methods - simplified UI

  // Removed clearAllOverlays method - simplified UI

  private updateStatusText(text: string) {
    this.statusText.text = text;
    
    // Animate text update
    LSTween.textAlphaTo(this.statusText, 0, 200)
      .onComplete(() => {
        this.statusText.text = text;
        LSTween.textAlphaTo(this.statusText, 1, 200).start();
      })
      .start();
  }

  // Public methods for external control
  public getDetectedComponentsCount(): number {
    return this.detectedComponentsCount;
  }

  public isCircuitTopologyComplete(): boolean {
    return this.circuitTopologyComplete;
  }

  public getCurrentUIState(): UIState {
    return this.currentUIState;
  }
}