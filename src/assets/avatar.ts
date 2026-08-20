// Animated Male Chatbot Avatar in Modern 3D Illustrated Style
export const MALE_AI_CHATBOT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0e7490" stop-opacity="0.8"/>
      <stop offset="60%" stop-color="#0f172a" stop-opacity="1"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="1"/>
    </radialGradient>
    
    <linearGradient id="faceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="50%" stop-color="#cbd5e1"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>

    <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="30%" stop-color="#0369a1"/>
      <stop offset="100%" stop-color="#082f49"/>
    </linearGradient>

    <linearGradient id="suitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>

    <linearGradient id="cyanNeon" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>

    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <style>
    @keyframes eyePulse {
      0%, 100% { transform: scaleY(1); opacity: 0.95; }
      50% { transform: scaleY(0.9); opacity: 1; filter: drop-shadow(0 0 6px #22d3ee); }
      92% { transform: scaleY(1); }
      95% { transform: scaleY(0.1); }
      98% { transform: scaleY(1); }
    }
    @keyframes earPulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; filter: drop-shadow(0 0 8px #38bdf8); }
    }
    @keyframes auraFloat {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-2px); }
    }
    .animated-bot {
      animation: auraFloat 4s ease-in-out infinite;
      transform-origin: center;
    }
    .bot-eyes {
      animation: eyePulse 4s ease-in-out infinite;
      transform-origin: 128px 132px;
    }
    .bot-ears {
      animation: earPulse 2.5s ease-in-out infinite;
    }
  </style>

  <!-- Background Base -->
  <rect width="256" height="256" fill="url(#bgGlow)" />

  <!-- Cyber grid overlay -->
  <circle cx="128" cy="128" r="120" fill="none" stroke="#06b6d4" stroke-width="1" stroke-opacity="0.15" stroke-dasharray="4 6"/>
  <circle cx="128" cy="128" r="95" fill="none" stroke="#38bdf8" stroke-width="1" stroke-opacity="0.1" />

  <g class="animated-bot">
    <!-- Cyber Torso / Armor Suit -->
    <path d="M50 240 C50 195 80 185 128 185 C176 185 206 195 206 240 Z" fill="url(#suitGrad)" stroke="#334155" stroke-width="2"/>
    <path d="M90 190 L128 215 L166 190" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" filter="url(#glow)"/>
    <circle cx="128" cy="225" r="4" fill="#38bdf8" filter="url(#glow)"/>

    <!-- Neck with Cyber Joint -->
    <rect x="112" y="160" width="32" height="28" rx="6" fill="#475569"/>
    <line x1="114" y1="172" x2="142" y2="172" stroke="#22d3ee" stroke-width="2" stroke-opacity="0.8"/>

    <!-- Head Base (Sleek 3D Male Android) -->
    <path d="M76 105 C76 65 95 55 128 55 C161 55 180 65 180 105 C180 148 160 175 128 175 C96 175 76 148 76 105 Z" fill="url(#faceGrad)" stroke="#cbd5e1" stroke-width="1.5"/>

    <!-- Cheek Cyber Seams -->
    <path d="M85 125 Q95 145 108 152" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M171 125 Q161 145 148 152" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>

    <!-- Ear Comms / Holographic Headset Elements -->
    <g class="bot-ears">
      <!-- Left Ear Pod -->
      <rect x="64" y="105" width="14" height="28" rx="6" fill="#0f172a" stroke="#0ea5e9" stroke-width="2"/>
      <circle cx="71" cy="119" r="3" fill="#22d3ee" filter="url(#glow)"/>
      
      <!-- Right Ear Pod + Mic Antenna -->
      <rect x="178" y="105" width="14" height="28" rx="6" fill="#0f172a" stroke="#0ea5e9" stroke-width="2"/>
      <circle cx="185" cy="119" r="3" fill="#22d3ee" filter="url(#glow)"/>
      <path d="M185 125 Q185 155 162 162" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round"/>
      <circle cx="160" cy="162" r="3" fill="#38bdf8" filter="url(#glow)"/>
    </g>

    <!-- Modern Styled Male AI Hair (Cyber / Illustrated 3D Quiff) -->
    <path d="M68 95 C65 65 85 40 128 36 C165 32 188 48 190 75 C190 85 184 92 180 95 C176 80 162 60 128 60 C95 60 80 80 68 95 Z" fill="url(#hairGrad)"/>
    <path d="M100 42 Q130 30 168 45 Q135 48 112 58 Z" fill="#38bdf8" opacity="0.6"/>

    <!-- Eyes Display (Friendly Glowing Cyan Visor Eyes) -->
    <g class="bot-eyes">
      <!-- Left Eye -->
      <ellipse cx="106" cy="122" rx="10" ry="12" fill="#0284c7"/>
      <ellipse cx="106" cy="122" rx="8" ry="10" fill="#22d3ee" filter="url(#glow)"/>
      <circle cx="104" cy="119" r="3" fill="#ffffff"/>
      <!-- Left Eyebrow -->
      <path d="M96 104 Q106 100 118 104" fill="none" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/>

      <!-- Right Eye -->
      <ellipse cx="150" cy="122" rx="10" ry="12" fill="#0284c7"/>
      <ellipse cx="150" cy="122" rx="8" ry="10" fill="#22d3ee" filter="url(#glow)"/>
      <circle cx="148" cy="119" r="3" fill="#ffffff"/>
      <!-- Right Eyebrow -->
      <path d="M138 104 Q150 100 160 104" fill="none" stroke="#0284c7" stroke-width="3" stroke-linecap="round"/>
    </g>

    <!-- Nose Bridge -->
    <path d="M128 120 L126 135 L131 135" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>

    <!-- Friendly Chatbot Smile -->
    <path d="M114 148 Q128 160 142 148" fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M118 149 Q128 156 138 149" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" opacity="0.8"/>

    <!-- Forehead Tech Node -->
    <polygon points="128,68 132,74 128,80 124,74" fill="#22d3ee" filter="url(#glow)" opacity="0.9"/>
  </g>
</svg>
`)}`;
