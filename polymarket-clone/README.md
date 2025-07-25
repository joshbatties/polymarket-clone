# PolyMarket Clone - React Native/Expo App

A comprehensive prediction market mobile application built with React Native and Expo, inspired by PolyMarket. This app allows users to trade on prediction markets, manage portfolios, and track market trends.

## 🚀 Features

### Core Functionality
- **Market Discovery**: Browse and search prediction markets across multiple categories
- **Advanced Trading**: Buy and sell shares with market orders and limit orders
- **Portfolio Management**: Track positions, P&L, and performance metrics
- **Watchlist**: Save favorite markets for quick access
- **Order Book**: View market depth and trading activity
- **Real-time Notifications**: Get alerts for trade executions and price movements
- **Activity Tracking**: Monitor complete trading history

### Market Categories
- Politics
- Sports
- Crypto
- Business
- Science
- Entertainment

### Advanced Features
- **Smart Search**: Trending topics and recent search suggestions
- **Price Charts**: Visual market price history
- **Market Analytics**: Volume, share distribution, and market metrics
- **User Profiles**: Performance tracking and achievement system
- **Responsive Design**: Optimized for both iOS and Android

## 🛠 Tech Stack

- **Framework**: React Native with Expo SDK 53
- **Navigation**: Expo Router with tabs
- **UI Components**: Custom components with React Native
- **Icons**: Expo Vector Icons
- **Styling**: StyleSheet with modern design patterns
- **State Management**: React Hooks (useState, useEffect)
- **Type Safety**: TypeScript
- **Date Handling**: date-fns
- **Graphics**: Linear gradients and SVG support

## 📱 Screens

### Main Navigation
1. **Markets** - Browse and search prediction markets
2. **Portfolio** - View positions and performance
3. **Activity** - Trading history and notifications
4. **Profile** - User settings and account management

### Additional Features
- Market detail pages with trading interface
- Order book visualization
- Notification center
- Search with suggestions
- Watchlist management

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or later)
- npm or yarn
- Expo CLI
- iOS Simulator (for iOS development)
- Android Studio/Emulator (for Android development)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/polymarket-clone.git
cd polymarket-clone
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm start
# or
expo start
```

4. Run on your preferred platform:
- **iOS**: Press `i` in the terminal or scan QR code with Expo Go
- **Android**: Press `a` in the terminal or scan QR code with Expo Go
- **Web**: Press `w` in the terminal

## 📁 Project Structure

```
polymarket-clone/
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation
│   ├── market/            # Market detail pages
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
│   ├── MarketCard.tsx     # Market display card
│   ├── OrderBook.tsx      # Order book component
│   ├── NotificationCenter.tsx
│   └── WatchlistButton.tsx
├── data/                  # Mock data and types
│   └── mockData.ts        # Sample market data
├── types/                 # TypeScript definitions
│   └── market.ts          # Data interfaces
└── assets/               # Images and static files
```

## 🎨 Design Features

### UI/UX Highlights
- **Modern Interface**: Clean, iOS-inspired design
- **Consistent Theming**: Blue accent colors with proper contrast
- **Responsive Layout**: Adapts to different screen sizes
- **Smooth Animations**: Subtle transitions and feedback
- **Accessibility**: Proper contrast ratios and touch targets

### Key Components
- **Market Cards**: Rich information display with price indicators
- **Trading Interface**: Intuitive buy/sell controls
- **Portfolio Visualization**: Clear P&L tracking with color coding
- **Search Experience**: Auto-suggestions and trending topics
- **Notification System**: Real-time alerts and confirmations

## 📊 Data Structure

### Core Models
- **Market**: Prediction market with pricing and metadata
- **Position**: User holdings in specific markets
- **Trade**: Historical trading activity
- **User Profile**: Account performance and settings
- **Order Book**: Market depth and liquidity data

### Mock Data
The app includes comprehensive mock data for:
- 12+ prediction markets across different categories
- User portfolio with multiple positions
- Trading history with realistic timestamps
- Order book data with market depth
- Notifications and alerts

## 🔧 Customization

### Adding New Markets
1. Add market data to `data/mockData.ts`
2. Include proper category classification
3. Set realistic pricing and volume data

### Extending Features
- Add new market categories in `types/market.ts`
- Create additional notification types
- Implement new chart types or analytics
- Add social features like comments or ratings

## 🚧 Future Enhancements

### Planned Features
- [ ] Real-time WebSocket connections
- [ ] Advanced charting with technical indicators
- [ ] Social trading features
- [ ] Limit order types
- [ ] Market creation functionality
- [ ] Push notifications
- [ ] Dark mode support
- [ ] Multi-language support

### Technical Improvements
- [ ] State management with Redux/Zustand
- [ ] API integration with real data
- [ ] Unit and integration testing
- [ ] Performance optimization
- [ ] Offline functionality
- [ ] Enhanced accessibility features

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

For questions or support:
- Create an issue on GitHub
- Check the documentation
- Review the code examples

## ⚡ Performance

The app is optimized for:
- Fast initial load times
- Smooth scrolling and navigation
- Efficient memory usage
- Responsive user interactions
- Minimal bundle size

## 🔒 Security

Security considerations:
- Type-safe TypeScript implementation
- Input validation on all forms
- Secure mock data patterns
- Error boundary protection
- Safe navigation handling

---

Built with ❤️ using React Native and Expo. Inspired by PolyMarket's innovative approach to prediction markets.
