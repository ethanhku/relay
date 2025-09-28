# Breadboard Circuit Assistant for Snapchat Spectacles

A comprehensive AR-powered breadboarding assistant that helps users build circuit prototypes using Snapchat Spectacles and Gemini Live AI.

## 🎯 Project Overview

This project addresses the inefficiencies in breadboarding by providing real-time component identification, circuit topology analysis, and AR-guided placement assistance. The system uses Gemini Live API for computer vision and Lens Studio for AR visualization.

### Key Features

- **Real-time Component Detection**: Identifies resistors, op amps, and other circuit components
- **Circuit Topology Analysis**: Recognizes non-inverting op amp circuits and validates connections
- **AR Placement Guidance**: Highlights optimal breadboard holes with 3D overlays
- **Depth API Integration**: Accurate 3D positioning using Spectacles depth sensing
- **Voice Interaction**: Natural language communication with the AI assistant

## 🏗️ Architecture

### Core Components

1. **BreadboardAssistant.ts** - Main Gemini Live integration and circuit analysis
2. **BreadboardAROverlay.ts** - AR visualization system for component placement
3. **BreadboardUIBridge.ts** - UI controller and user interaction management
4. **BreadboardDepthMapper.ts** - 3D positioning using depth API
5. **CircuitTopologyAnalyzer.ts** - Circuit analysis and validation engine
6. **ComponentDetector.ts** - Advanced component identification and classification

### System Flow

```
Camera Feed → Gemini Live → Component Detection → Circuit Analysis → AR Overlay → User Guidance
```

## 🚀 Getting Started

### Prerequisites

- Snapchat Lens Studio
- Gemini API key
- Snapchat Spectacles (for testing)

### Installation

1. Clone this repository
2. Open the project in Lens Studio
3. Configure your Gemini API key
4. Set up the required materials and prefabs
5. Deploy to Spectacles

### Configuration

#### Gemini Assistant Setup

```typescript
// Configure the breadboard assistant
const assistant = new BreadboardAssistant();
assistant.enableVideoInput = true;
assistant.enableAudioOutput = true;
assistant.targetCircuitType = "non_inverting_op_amp";
```

#### AR Overlay Configuration

```typescript
// Set up AR overlay materials
const overlay = new BreadboardAROverlay();
overlay.highlightSize = 0.02; // 2cm highlights
overlay.highlightPulseSpeed = 1.0; // 1 pulse per second
overlay.connectionLineWidth = 0.005; // 5mm connection lines
```

## 📋 Usage Guide

### Basic Circuit Analysis

1. **Start Analysis**: Pinch the start button to begin circuit detection
2. **Component Detection**: Point camera at resistors and op amps
3. **Circuit Validation**: System automatically detects circuit topology
4. **Placement Guidance**: Follow AR highlights for optimal component placement

### Supported Circuit Types

- **Non-inverting Op Amp**: Input resistor + feedback resistor + op amp
- **Inverting Op Amp**: Similar topology with different connections
- **Voltage Divider**: Two-resistor circuits
- **Generic Circuits**: Basic component identification

### Component Recognition

#### Resistors
- Color code reading (4-band and 5-band)
- Printed value recognition
- Package type identification (axial, SMD, through-hole)

#### Op Amps
- Pin identification (V+, V-, OUT, IN+, IN-)
- Package recognition (DIP-8, SOIC-8, TO-99)
- Part number detection

## 🎨 AR Visualization

### Visual Elements

- **Hole Highlights**: Pulsing spheres at optimal placement locations
- **Connection Lines**: 3D lines showing circuit connections
- **Component Labels**: Floating text with component information
- **Circuit Paths**: Highlighted routes for signal flow

### Color Coding

- 🟢 **Green**: Optimal placement locations
- 🔵 **Blue**: Connection lines
- 🔴 **Red**: Warnings or errors
- 🟡 **Yellow**: Information or labels
- 🟠 **Orange**: Circuit paths

## 🔧 Technical Details

### Coordinate System

The system uses a 1000x1000 grid coordinate system:
- (0,0) = Top-left corner of breadboard
- (1000,1000) = Bottom-right corner of breadboard
- 10-unit spacing for realistic breadboard hole mapping

### Depth API Integration

```typescript
// Convert 2D breadboard coordinates to 3D world position
const worldPos = depthMapper.mapBreadboardToWorldPosition(breadboardX, breadboardY);
```

### Circuit Analysis Algorithm

1. **Component Detection**: Identify components and their properties
2. **Connection Analysis**: Determine component relationships
3. **Topology Validation**: Verify circuit completeness
4. **Gain Calculation**: Compute circuit parameters
5. **Placement Optimization**: Suggest optimal component positions

## 🎯 MVP Implementation

### Phase 1: Core Detection ✅
- [x] Resistor value identification
- [x] Op amp pin detection
- [x] Basic circuit topology recognition

### Phase 2: AR Guidance ✅
- [x] Breadboard hole highlighting
- [x] Component placement suggestions
- [x] Connection line visualization

### Phase 3: Advanced Features ✅
- [x] Depth API integration
- [x] Circuit validation
- [x] Real-time analysis

## 🚀 Future Enhancements

### Planned Features

- **Multi-circuit Support**: Support for more complex circuit topologies
- **Component Library**: Expanded component recognition database
- **Simulation Integration**: Real-time circuit simulation
- **Collaborative Features**: Multi-user breadboarding sessions
- **Export Functionality**: Generate PCB layouts from breadboard designs

### Advanced Circuit Types

- Low-pass and high-pass filters
- Oscillator circuits
- Power supply designs
- Digital logic circuits
- Mixed-signal designs

## 🐛 Troubleshooting

### Common Issues

1. **Component Not Detected**
   - Ensure good lighting
   - Check component orientation
   - Verify camera focus

2. **AR Overlays Not Appearing**
   - Check depth API initialization
   - Verify material assignments
   - Ensure proper scene setup

3. **Circuit Analysis Errors**
   - Confirm component values are readable
   - Check circuit completeness
   - Verify connection topology

### Debug Mode

Enable debug logging:
```typescript
assistant.enableDebugMode = true;
```

## 📊 Performance Optimization

### Optimization Tips

- Use appropriate confidence thresholds
- Limit overlay count for performance
- Optimize material properties
- Use efficient depth calculations

### System Requirements

- Snapchat Spectacles with depth sensing
- Stable internet connection for Gemini API
- Adequate lighting for component detection
- Clear breadboard surface

## 🤝 Contributing

### Development Guidelines

1. Follow TypeScript best practices
2. Maintain component modularity
3. Add comprehensive error handling
4. Include unit tests for new features
5. Update documentation for API changes

### Code Structure

```
Assets/Scripts/
├── BreadboardAssistant.ts      # Main AI integration
├── BreadboardAROverlay.ts      # AR visualization
├── BreadboardUIBridge.ts       # UI controller
├── BreadboardDepthMapper.ts    # 3D positioning
├── CircuitTopologyAnalyzer.ts  # Circuit analysis
└── ComponentDetector.ts        # Component recognition
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Snapchat Lens Studio team for AR platform
- Google Gemini team for AI capabilities
- Circuit design community for feedback and testing

## 📞 Support

For questions or support:
- Create an issue in this repository
- Contact the development team
- Check the documentation wiki

---

**Built with ❤️ for the circuit design community**
