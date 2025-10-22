# 🎯 Curated Model Selection - Top Tier Only

## Text/Chat Models (Top Performers)

### Claude (Anthropic) - Top 2
```javascript
{
    'claude-3.5-sonnet': {
        provider: 'Anthropic',
        reasoning: 'Best overall performance, fast, excellent coding',
        useCase: 'General purpose, coding, analysis',
        speed: 'fast',
        quality: 'excellent'
    },
    'claude-3-opus': {
        provider: 'Anthropic',
        reasoning: 'Highest quality, best for complex tasks',
        useCase: 'Complex reasoning, research, creative writing',
        speed: 'medium',
        quality: 'excellent'
    }
}
```

### ChatGPT (OpenAI) - Top 2
```javascript
{
    'gpt-4-turbo': {
        provider: 'OpenAI',
        reasoning: 'Latest GPT-4, vision capable, fast',
        useCase: 'General purpose, multimodal tasks',
        speed: 'fast',
        quality: 'high'
    },
    'gpt-4': {
        provider: 'OpenAI',
        reasoning: 'Reliable, widely tested, stable',
        useCase: 'General purpose, coding, analysis',
        speed: 'medium',
        quality: 'high'
    }
}
```

### DeepSeek - Top 1
```javascript
{
    'deepseek-coder-v2': {
        provider: 'DeepSeek',
        reasoning: 'Best coding specialist, open source',
        useCase: 'Code generation, debugging, technical tasks',
        speed: 'fast',
        quality: 'high'
    }
}
```

### Kimi (Moonshot AI) - Top 1
```javascript
{
    'kimi-chat': {
        provider: 'Moonshot',
        reasoning: 'Long context (200k+), excellent Chinese language',
        useCase: 'Long documents, multilingual, research',
        speed: 'medium',
        quality: 'high'
    }
}
```

### GLM (Zhipu AI) - Top 1
```javascript
{
    'glm-4': {
        provider: 'Zhipu',
        reasoning: 'Chinese leader, strong bilingual capability',
        useCase: 'Chinese/English tasks, general purpose',
        speed: 'fast',
        quality: 'high'
    }
}
```

**Total Text Models: 7 (carefully selected)**

---

## Image Generation Models (Top Tier)

### Top 3 Image Models
```javascript
{
    'dall-e-3': {
        provider: 'OpenAI',
        reasoning: 'Best prompt understanding, high quality',
        useCase: 'Creative images, detailed prompts',
        quality: 'excellent'
    },
    'midjourney-v6': {
        provider: 'Midjourney',
        reasoning: 'Artistic quality, photorealistic',
        useCase: 'Art, photography, creative work',
        quality: 'excellent'
    },
    'stable-diffusion-xl': {
        provider: 'Stability AI',
        reasoning: 'Open source, fast, customizable',
        useCase: 'Quick generation, batch processing',
        quality: 'high'
    }
}
```

**Total Image Models: 3**

---

## Video Generation Models (Top Tier)

### Top 3 Video Models
```javascript
{
    'runway-gen-2': {
        provider: 'Runway',
        reasoning: 'Industry standard, best quality',
        useCase: 'Professional video, text-to-video',
        quality: 'excellent'
    },
    'pika-1.0': {
        provider: 'Pika',
        reasoning: 'Fast generation, good quality',
        useCase: 'Quick videos, social media',
        quality: 'high'
    },
    'stable-video': {
        provider: 'Stability AI',
        reasoning: 'Open source, consistent with SD',
        useCase: 'Experimental, customizable',
        quality: 'good'
    }
}
```

**Total Video Models: 3**

---

## Summary Statistics

### Before (Bloated):
- Text Models: 100+
- Image Models: 10+
- Video Models: 5+
- Platforms: 5
- **Total Complexity: VERY HIGH**

### After (Curated):
- Text Models: 7 (best in class)
- Image Models: 3 (top tier)
- Video Models: 3 (professional grade)
- Platforms: 2 (LMArena + ISH)
- **Total Complexity: LOW**

---

## Rationale for Each Selection

### Text Models:

1. **Claude 3.5 Sonnet** - Current best overall model
2. **Claude 3 Opus** - For when you need maximum intelligence
3. **GPT-4 Turbo** - Fast, reliable, vision-capable
4. **GPT-4** - Stable baseline
5. **DeepSeek Coder V2** - Best for coding tasks
6. **Kimi** - Best for long context (200k tokens)
7. **GLM-4** - Best for Chinese language

### Image Models:

1. **DALL-E 3** - Best prompt understanding
2. **Midjourney V6** - Best artistic quality
3. **Stable Diffusion XL** - Best for speed/customization

### Video Models:

1. **Runway Gen-2** - Industry standard
2. **Pika 1.0** - Best speed/quality ratio
3. **Stable Video** - Open source option

---

## Platform Distribution

### LMArena Can Access:
- ✅ Claude (all versions)
- ✅ GPT-4 (all versions)
- ✅ DeepSeek
- ✅ Many others

### ISH Can Access:
- ✅ Claude
- ✅ GPT-4
- ✅ Gemini (bonus)

### For Image/Video:
- Direct API or specialized platforms
- Not through LMArena/ISH

---

## Configuration

```javascript
const CURATED_MODELS = {
    text: {
        primary: ['claude-3.5-sonnet', 'gpt-4-turbo'],
        specialists: {
            coding: 'deepseek-coder-v2',
            longContext: 'kimi-chat',
            chinese: 'glm-4'
        },
        fallback: 'claude-3-opus'
    },

    image: {
        primary: 'dall-e-3',
        artistic: 'midjourney-v6',
        fast: 'stable-diffusion-xl'
    },

    video: {
        primary: 'runway-gen-2',
        fast: 'pika-1.0',
        experimental: 'stable-video'
    }
};
```

---

## Next Steps

1. **Create streamlined orchestrator** with these 13 models
2. **Remove 100+ unused models** from codebase
3. **Simplify platform integrations** (only LMArena + ISH for text)
4. **Add specialized handlers** for image/video platforms
5. **Implement smart routing** based on task type

Ready to implement? 🚀
