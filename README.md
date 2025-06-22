# 🎮 Errate 2/3 des Durchschnitts - Blockchain Game

Ein dezentrales Spiel basierend auf dem klassischen "Guess 2/3 of the Average" Spiel, implementiert als Smart Contract auf der Ethereum-Blockchain.

## 🎯 Spielprinzip

Spieler müssen eine Zahl zwischen 0 und 1000 erraten. Der Gewinner ist derjenige, der am nächsten zu **2/3 des Durchschnitts** aller eingereichten Zahlen liegt. Das Spiel verwendet ein Commit-Reveal-Schema für faire und transparente Spielabläufe.

## 📋 Voraussetzungen

### Software-Requirements

| Software | Mindestversion | Getestet mit |
|----------|----------------|--------------|
| **Node.js** | 18.0+ | v22.16.0 |
| **npm** | 8.0+ | v11.4.2 |
| **Google Chrome** | 120+ | v137.0.7151.120 |

### Installation prüfen

```bash
# Node.js Version prüfen
node --version

# npm Version prüfen
npm -v
```

## 🔧 Setup & Installation

### 1. 📡 Alchemy Archive Node Setup

1. **Account erstellen**: Gehe zu [alchemy.com](https://www.alchemy.com/)
2. **Anmelden** oder einloggen
3. **App erstellen**: 
   - "Create new app" klicken
   - Name und Use Case eingeben
   - Chain: **Ethereum** auswählen
   - "Create app" klicken
4. **Network URL kopieren**: In der Setup-Übersicht findest du die private Network URL

### 2. 📥 Repository Setup

```bash
# 1. Arbeitsordner auswählen
cd /pfad/zum/arbeitsordner

# 2. Repository klonen
git clone https://github.com/poarlmaximal/Errate-2-3-des-Durchschnitts.git

# 3. In Projektverzeichnis wechseln
cd Errate-2-3-des-Durchschnitts

# 4. Abhängigkeiten installieren
npm install
```

### 3. ⚙️ Hardhat Konfiguration

1. **Konfigurationsdatei öffnen**: `hardhat.config.js`
2. **Alchemy Key einfügen**: Ersetze den Platzhalter durch deine Alchemy Network URL
3. **Hardhat Node starten**:
   ```bash
   npx hardhat node
   ```

> 💡 **Tipp**: Sichere die angezeigten Account-Informationen für MetaMask!

### 4. 🦊 MetaMask Setup

#### Extension installieren
- [MetaMask Chrome Extension](https://chromewebstore.google.com/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn) installieren
- Account erstellen oder anmelden

#### Netzwerk konfigurieren
1. **Erweiterte Einstellungen** → "Test-Netzwerke anzeigen": **AN**
2. **Benutzerdefiniertes Netzwerk hinzufügen**:
   - **Network Name**: `Hardhat Fork (Sepolia)`
   - **RPC-URL**: `http://127.0.0.1:8545`
   - **Chain-ID**: `31337`
   - **Währungssymbol**: `ETH`
3. **"Speichern"** klicken

#### Test-Accounts importieren
1. **Netzwerk wählen**: "Hardhat Fork (Sepolia)"
2. **Account-Menü** → "Konto oder Hardware-Wallet hinzufügen"
3. **"Privater Schlüssel"** wählen
4. **Private Keys** aus dem Hardhat Node einzeln importieren
5. **"Importieren"** klicken

> 🔒 **Sicherheit**: Diese Keys sind nur für lokale Tests! Niemals in Production verwenden.

### 5. 📜 Smart Contracts deployen

#### Mit Remix IDE (Empfohlen)

1. **Contracts öffnen**: 
   - `contracts/GameFactory.sol`
   - `contracts/Game.sol`
   
2. **In Remix IDE compilieren**:
   - Compiler Version: **0.8.30+commit.73712a01**
   
3. **Deployen**:
   - Environment: **"Dev – Hardhat Provider"**
   - Hardhat JSON-RPC Endpoint: `http://127.0.0.1:8545` bestätigen
   - Einen der 20 Hardhat-Accounts auswählen (je 10,000 ETH)
   - **GameFactory.sol** deployen
   
4. **Contract-Adresse kopieren** und in `scripts/config.js` einfügen

### 6. 🌐 Frontend starten

```bash
# Neues Terminal öffnen
cd scripts

# HTTP-Server starten
npx http-server

# Browser öffnen
# Öffne http://127.0.0.1:8080 in Chrome
```

## 🎮 Spielanleitung

1. **Wallet verbinden** - MetaMask mit der Anwendung verbinden
2. **Spiel auswählen** - Aus verfügbaren Spielen wählen oder neues erstellen
3. **Zahl committen** - Geheime Zahl (0-1000) + Salt eingeben
4. **Zahl revealen** - Nach der Commit-Phase dieselbe Zahl + Salt preisgeben
5. **Gewinner ermitteln** - System berechnet 2/3 des Durchschnitts
6. **Auszahlung** - Gewinner und Deposits abholen

## 🏗️ Projektstruktur

```
Errate-2-3-des-Durchschnitts/
├── contracts/              # Smart Contracts
│   ├── GameFactory.sol     # Factory für Game-Erstellung
│   └── Game.sol           # Haupt-Spiellogik
├── scripts/               # Frontend & Konfiguration
│   ├── index.html         # Haupt-Interface
│   ├── app.js            # Frontend-Logik
│   ├── config.js         # Contract-Adressen
│   └── style.css         # Styling
├── test/                 # Unit Tests
├── hardhat.config.js     # Hardhat-Konfiguration
└── package.json         # Abhängigkeiten
```

## 🔒 Sicherheitsfeatures

- **Commit-Reveal-Schema**: Verhindert Frontrunning
- **Anti-Grief-Deposits**: Schutz vor unehrlichen Spielern
- **Pull-Payment-Pattern**: Sichere Auszahlungen
- **Reentrancy-Schutz**: Schutz vor Reentrancy-Attacken

## 🛠️ Entwicklung

```bash
# Tests ausführen
npm test

# Contracts kompilieren
npx hardhat compile

# Lokales Netzwerk starten
npx hardhat node

# Contract-Größe prüfen
npx hardhat size-contracts
```

## 📊 Game-Parameter

| Parameter | Beschreibung | Konfigurierbar |
|-----------|-------------|----------------|
| Entry Fee | Einsatz pro Spieler | ✅ |
| Service Fee | Gebühr für GameMaster | ✅ |
| Deposit | Anti-Grief-Kaution | ✅ |
| Commit Phase | Dauer der Commit-Phase | ✅ |
| Reveal Phase | Dauer der Reveal-Phase | ✅ |
| Max Players | Maximale Spieleranzahl | ✅ |

## 🚨 Troubleshooting

### Häufige Probleme

| Problem | Lösung |
|---------|--------|
| MetaMask verbindet nicht | Netzwerk-Konfiguration prüfen |
| Transaktionen schlagen fehl | Gas-Limit erhöhen |
| Contract nicht gefunden | Adresse in `config.js` prüfen |
| Hardhat Node Fehler | Node neu starten |

### Support

Bei Problemen:
1. Console-Logs in Chrome DevTools prüfen
2. MetaMask-Netzwerk-Einstellungen überprüfen
3. Hardhat Node Status kontrollieren

## 🤝 Contributing

1. Fork das Repository
2. Feature-Branch erstellen (`git checkout -b feature/amazing-feature`)
3. Changes committen (`git commit -m 'Add amazing feature'`)
4. Branch pushen (`git push origin feature/amazing-feature`)
5. Pull Request öffnen

## 📄 Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Siehe [LICENSE](LICENSE) für Details.

## 🎉 Viel Spaß!

Genieße das Spiel und experimentiere mit verschiedenen Strategien. Das Spiel zeigt interessante spieltheoretische Konzepte und Nash-Gleichgewichte in Aktion!

---

**Entwickelt mit ❤️ für die Blockchain-Community**

