import { AppProps } from 'next/app'
import 'antd/dist/antd.css'
import 'style.css'

export default ({ Component, pageProps }: AppProps) => (
  <Component {...pageProps} />
)
