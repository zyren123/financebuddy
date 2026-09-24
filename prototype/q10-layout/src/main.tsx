import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// 抛弃式原型:刻意不开 StrictMode(dockview/RGL 的 effect 双执行会添乱)
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
