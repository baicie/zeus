import {
  defineFunctionalWC,
  useState,
  useEffect,
  useComputed,
  jsx,
} from '../src'

/**
 * 天气组件示例
 * 展示异步数据获取和条件渲染
 */
interface WeatherData {
  location: string
  temperature: number
  description: string
  humidity: number
  windSpeed: number
}

function WeatherWidget(props: { city?: string; apiKey?: string }) {
  const weather = useState<WeatherData | null>(null)
  const loading = useState(false)
  const error = useState<string | null>(null)
  const lastUpdated = useState<Date | null>(null)

  // 计算属性：温度显示
  const temperatureDisplay = useComputed(() => {
    if (!weather()) return '--'
    return `${Math.round(weather()!.temperature)}°C`
  })

  // 计算属性：天气图标
  const weatherIcon = useComputed(() => {
    if (!weather()) return '🌤️'
    const desc = weather()!.description.toLowerCase()
    if (desc.includes('sun') || desc.includes('clear')) return '☀️'
    if (desc.includes('cloud')) return '☁️'
    if (desc.includes('rain')) return '🌧️'
    if (desc.includes('snow')) return '❄️'
    if (desc.includes('storm')) return '⛈️'
    return '🌤️'
  })

  // 获取天气数据
  const fetchWeather = async () => {
    const city = props.city || 'London'
    const apiKey = props.apiKey || 'demo'

    loading(true)
    error(null)

    try {
      // 模拟 API 调用（实际项目中替换为真实 API）
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 模拟数据
      const mockData: WeatherData = {
        location: city,
        temperature: Math.random() * 30 + 5, // 5-35°C
        description: ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'][
          Math.floor(Math.random() * 4)
        ],
        humidity: Math.floor(Math.random() * 40 + 40), // 40-80%
        windSpeed: Math.floor(Math.random() * 20 + 5), // 5-25 km/h
      }

      weather(mockData)
      lastUpdated(new Date())
    } catch (err) {
      error('Failed to fetch weather data')
    } finally {
      loading(false)
    }
  }

  // 组件挂载时获取数据
  useEffect(() => {
    fetchWeather()
  }, [])

  // 自动刷新（每5分钟）
  useEffect(() => {
    const interval = setInterval(fetchWeather, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return jsx(
    'div',
    {
      style:
        'padding: 20px; border: 1px solid #ddd; border-radius: 12px; background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%); color: white; font-family: Arial, sans-serif; min-width: 300px;',
    },
    // 标题
    jsx(
      'div',
      {
        style:
          'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;',
      },
      jsx('h3', { style: 'margin: 0; font-size: 18px;' }, 'Weather'),
      jsx(
        'button',
        {
          style:
            'background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;',
          onClick: fetchWeather,
          disabled: loading(),
        },
        loading() ? '⏳' : '🔄'
      )
    ),

    // 内容区域
    loading()
      ? jsx(
          'div',
          { style: 'text-align: center; padding: 20px;' },
          jsx('div', { style: 'font-size: 24px; margin-bottom: 8px;' }, '⏳'),
          jsx(
            'p',
            { style: 'margin: 0; opacity: 0.8;' },
            'Loading weather data...'
          )
        )
      : error()
      ? jsx(
          'div',
          { style: 'text-align: center; padding: 20px;' },
          jsx('div', { style: 'font-size: 24px; margin-bottom: 8px;' }, '⚠️'),
          jsx('p', { style: 'margin: 0 0 12px 0;' }, error()),
          jsx(
            'button',
            {
              style:
                'background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer;',
              onClick: fetchWeather,
            },
            'Retry'
          )
        )
      : weather()
      ? jsx(
          'div',
          null,
          // 主要信息
          jsx(
            'div',
            { style: 'text-align: center; margin-bottom: 20px;' },
            jsx(
              'div',
              { style: 'font-size: 48px; margin-bottom: 8px;' },
              weatherIcon()
            ),
            jsx(
              'div',
              {
                style:
                  'font-size: 36px; font-weight: bold; margin-bottom: 4px;',
              },
              temperatureDisplay()
            ),
            jsx(
              'div',
              { style: 'font-size: 16px; opacity: 0.9;' },
              weather()!.description
            ),
            jsx(
              'div',
              { style: 'font-size: 14px; opacity: 0.8; margin-top: 4px;' },
              weather()!.location
            )
          ),

          // 详细信息
          jsx(
            'div',
            {
              style:
                'display: grid; grid-template-columns: 1fr 1fr; gap: 12px;',
            },
            jsx(
              'div',
              { style: 'text-align: center;' },
              jsx(
                'div',
                { style: 'font-size: 12px; opacity: 0.8; margin-bottom: 4px;' },
                'Humidity'
              ),
              jsx(
                'div',
                { style: 'font-size: 18px; font-weight: bold;' },
                `${weather()!.humidity}%`
              )
            ),
            jsx(
              'div',
              { style: 'text-align: center;' },
              jsx(
                'div',
                { style: 'font-size: 12px; opacity: 0.8; margin-bottom: 4px;' },
                'Wind'
              ),
              jsx(
                'div',
                { style: 'font-size: 18px; font-weight: bold;' },
                `${weather()!.windSpeed} km/h`
              )
            )
          ),

          // 更新时间
          lastUpdated() &&
            jsx(
              'div',
              {
                style:
                  'text-align: center; margin-top: 16px; font-size: 12px; opacity: 0.7;',
              },
              `Updated: ${lastUpdated()!.toLocaleTimeString()}`
            )
        )
      : null
  )
}

// 定义 Web Component
defineFunctionalWC('alien-weather-widget', WeatherWidget, {
  shadow: true,
  styles: `
    :host {
      display: block;
      margin: 20px 0;
    }
    
    button:hover {
      opacity: 0.8;
    }
    
    button:active {
      transform: translateY(1px);
    }
    
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,
  observedAttributes: ['city', 'api-key'],
})
