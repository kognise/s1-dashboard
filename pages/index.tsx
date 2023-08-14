import S1 from 's1db'
import Head from 'next/head'
import { useState, useEffect } from 'react'
import {
  Layout,
  Menu,
  Typography,
  Button,
  Form,
  Input,
  Checkbox,
  Row,
  Col,
  Space,
  Spin
} from 'antd'
import {
  DatabaseFilled,
  PlusOutlined,
  FileTextOutlined,
  ReloadOutlined
} from '@ant-design/icons'

const assertUnreachable = (x: never): never => {
  throw new Error("This shouldn't have happened")
}

const tryFormat = (string: string) => {
  try {
    return JSON.stringify(JSON.parse(string), null, 2)
  } catch {
    return string
  }
}

const tryRemoveFormatting = (string: string) => {
  try {
    return JSON.stringify(JSON.parse(string))
  } catch {
    return string
  }
}

const formLayout = {
  labelCol: { span: 4 },
  wrapperCol: { span: 20 }
}

const formTailLayout = {
  wrapperCol: {
    sm: { offset: formLayout.labelCol.span, span: formLayout.wrapperCol.span }
  }
}

type Connection = {
  id: string
  name: string
  token: string
  baseUrl?: string
}

type ConnectionForm = Connection & {
  save: boolean
}

type KeyState =
  | { state: 'new' | 'adding' }
  | {
      state: 'loading' | 'deleting'
      key: string
    }
  | {
      state: 'ready' | 'saving'
      key: string
      value: string
      valueChanged: boolean
    }

type ConnectionState =
  | { state: 'idle' }
  | {
      state: 'loading'
      connection: Connection
    }
  | {
      state: 'ready' | 'updating'
      connection: Connection
      keys: string[]
      keyState: KeyState
      db: S1
    }
  | {
      state: 'error' | 'retrying'
      error: Error
      connection: Connection
    }

export default () => {
  const [connectionForm] = Form.useForm()
  const [keyForm] = Form.useForm()

  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    state: 'idle'
  })
  const [existing, setExisting] = useState<Connection | null>(null)

  useEffect(() => {
    setConnections(JSON.parse(localStorage.getItem('connections') || '[]'))
  }, [])
  useEffect(() => {
    localStorage.setItem('connections', JSON.stringify(connections))
  }, [connections])

  let main
  let sider
  let header

  switch (connectionState.state) {
    case 'idle':
    case 'loading': {
      main = (
        <Space style={{ width: '100%' }} direction='vertical'>
          <Row>
            <Col {...formTailLayout.wrapperCol}>
              <Typography.Title level={2}>
                Connect to {existing?.name ?? 'a database'}
              </Typography.Title>
            </Col>
          </Row>

          <Form
            initialValues={{ save: true, baseUrl: 'https://s1.kognise.dev/' }}
            form={connectionForm}
            onFinish={async (res) => {
              const form = res as ConnectionForm

              const connection = {
                id: Math.random().toString(),
                name: res.name,
                token: res.token,
                baseUrl: res.baseUrl
              }

              try {
                if (form.save) setConnections([...connections, connection])
                if (existing) {
                  console.log('updating because existing')
                  const index = connections.indexOf(existing)
                  setExisting(connection)
                  setConnections([
                    ...connections.slice(0, index),
                    connection,
                    ...connections.slice(index + 1)
                  ])
                }

                setConnectionState({
                  state: 'loading',
                  connection
                })

                const db = new S1(connection.token, connection.baseUrl)
                const keys = await db.getKeys()
                keyForm.resetFields()
                setConnectionState({
                  state: 'ready',
                  connection,
                  db,
                  keys,
                  keyState: { state: 'new' }
                })
              } catch (error) {
                setConnectionState({
                  state: 'error',
                  error,
                  connection
                })
              }

              if (existing !== connection) {
                connectionForm.setFieldsValue({ save: false })
                setExisting(connection)
              }
            }}
          >
            <Form.Item
              {...formLayout}
              label='Name'
              name='name'
              rules={[
                {
                  required: true,
                  message: 'Please input a connection name'
                }
              ]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              {...formLayout}
              label='Token'
              name='token'
              rules={[
                {
                  required: true,
                  message: 'Please input a database token'
                }
              ]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              {...formLayout}
              label='URL'
              name='baseUrl'
              rules={[
                {
                  type: 'url',
                  message: 'This must be a valid URL'
                }
              ]}
            >
              <Input />
            </Form.Item>

            <Form.Item {...formTailLayout} name='save' valuePropName='checked'>
              <Checkbox disabled={!!existing}>Save connection</Checkbox>
            </Form.Item>

            <Form.Item {...formTailLayout}>
              <Space>
                <Button
                  type='primary'
                  htmlType='submit'
                  loading={connectionState.state === 'loading'}
                >
                  {existing ? 'Connect & update' : 'Connect'}
                </Button>
                {existing && (
                  <Button
                    danger
                    onClick={() => {
                      const index = connections.indexOf(existing)
                      connectionForm.resetFields()
                      setExisting(null)
                      setConnectionState({ state: 'idle' })
                      setConnections([
                        ...connections.slice(0, index),
                        ...connections.slice(index + 1)
                      ])
                    }}
                  >
                    Forget
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Form>
        </Space>
      )
      break
    }

    case 'ready':
    case 'updating': {
      switch (connectionState.keyState.state) {
        case 'new':
        case 'adding': {
          main = (
            <Space style={{ width: '100%' }} direction='vertical'>
              <Row>
                <Col {...formTailLayout.wrapperCol}>
                  <Typography.Title level={2}>
                    Add a key/value pair
                  </Typography.Title>
                </Col>
              </Row>
              <Form
                form={keyForm}
                onFinish={async (res) => {
                  const { key, value } = res as { key: string; value: string }

                  setConnectionState({
                    ...connectionState,
                    keyState: {
                      ...connectionState.keyState,
                      state: 'adding'
                    }
                  })
                  await connectionState.db.set(key, value)
                  setConnectionState({
                    ...connectionState,
                    keyState: {
                      state: 'ready',
                      key,
                      value: tryFormat(value),
                      valueChanged: false
                    },
                    keys: await connectionState.db.getKeys()
                  })
                }}
              >
                <Form.Item
                  {...formLayout}
                  label='Key'
                  name='key'
                  rules={[
                    {
                      required: true,
                      message: 'Please input a key'
                    }
                  ]}
                >
                  <Input />
                </Form.Item>

                <Form.Item
                  {...formLayout}
                  label='Value'
                  name='value'
                  rules={[
                    {
                      required: true,
                      message: 'Please input a value'
                    }
                  ]}
                >
                  <Input.TextArea />
                </Form.Item>

                <Form.Item {...formTailLayout}>
                  <Button
                    type='primary'
                    htmlType='submit'
                    loading={connectionState.keyState.state === 'adding'}
                  >
                    Add
                  </Button>
                </Form.Item>
              </Form>
            </Space>
          )
          break
        }

        case 'loading': {
          main = (
            <div style={{ textAlign: 'center' }}>
              <Spin size='large' />
            </div>
          )
          break
        }

        case 'deleting': {
          main = (
            <div style={{ textAlign: 'center' }}>
              <Typography.Text>
                Deleting <code>{connectionState.keyState.key}</code>...
              </Typography.Text>
            </div>
          )
          break
        }

        case 'ready':
        case 'saving': {
          main = (
            <Space direction='vertical' style={{ width: '100%' }}>
              <Typography.Text>
                Key: <code>{connectionState.keyState.key}</code>
              </Typography.Text>

              <Input.TextArea
                id='code-editor'
                onKeyDown={(event) => {
                  const editor = document.getElementById(
                    'code-editor'
                  ) as HTMLTextAreaElement
                  const selectionStart = editor.selectionStart
                  const selectionEnd = editor.selectionEnd

                  if (event.keyCode === 9 && !event.shiftKey) {
                    event.preventDefault()

                    const newValue = [
                      editor.value.slice(0, editor.selectionStart),
                      '  ',
                      editor.value.slice(editor.selectionEnd)
                    ].join('')

                    if (
                      connectionState.keyState.state === 'ready' ||
                      connectionState.keyState.state === 'saving'
                    ) {
                      editor.value = newValue
                      editor.selectionStart =
                        selectionStart + 2 - (selectionEnd - selectionStart)
                      editor.selectionEnd =
                        selectionEnd + 2 - (selectionEnd - selectionStart)
                      setConnectionState({
                        ...connectionState,
                        keyState: {
                          ...connectionState.keyState,
                          value: newValue,
                          valueChanged: true
                        }
                      })
                    }
                  } else if (event.keyCode === 9 && event.shiftKey) {
                    event.preventDefault()

                    const beforeStart = editor.value
                      .slice(0, selectionStart)
                      .split('')
                      .reverse()
                      .join('')

                    const indexOfTab = beforeStart.indexOf('  ')
                    const indexOfNewline = beforeStart.indexOf('\n')

                    const newValue = [
                      beforeStart
                        .slice(indexOfTab + 2)
                        .split('')
                        .reverse()
                        .join(''),
                      beforeStart
                        .slice(0, indexOfTab)
                        .split('')
                        .reverse()
                        .join(''),
                      editor.value.slice(selectionEnd)
                    ].join('')

                    if (
                      indexOfTab !== -1 &&
                      indexOfTab < indexOfNewline &&
                      (connectionState.keyState.state === 'ready' ||
                        connectionState.keyState.state === 'saving')
                    ) {
                      editor.value = newValue
                      editor.selectionStart = selectionStart - 2
                      editor.selectionEnd = selectionEnd - 2
                      setConnectionState({
                        ...connectionState,
                        keyState: {
                          ...connectionState.keyState,
                          value: newValue,
                          valueChanged: true
                        }
                      })
                    }
                  }
                }}
                rows={10}
                value={connectionState.keyState.value}
                style={{
                  fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`
                }}
                onChange={(event) => {
                  if (
                    connectionState.keyState.state === 'ready' ||
                    connectionState.keyState.state === 'saving'
                  ) {
                    setConnectionState({
                      ...connectionState,
                      keyState: {
                        ...connectionState.keyState,
                        value: event.target.value,
                        valueChanged: true
                      }
                    })
                  }
                }}
              />

              <Space>
                <Button
                  type='primary'
                  disabled={!connectionState.keyState.valueChanged}
                  loading={connectionState.keyState.state === 'saving'}
                  onClick={async () => {
                    if (connectionState.keyState.state === 'ready') {
                      const loadingState: ConnectionState = {
                        ...connectionState,
                        keyState: {
                          ...connectionState.keyState,
                          state: 'saving'
                        }
                      }
                      setConnectionState(loadingState)

                      await connectionState.db.setRaw(
                        connectionState.keyState.key,
                        tryRemoveFormatting(connectionState.keyState.value)
                      )

                      setConnectionState((connectionState) =>
                        connectionState === loadingState &&
                        connectionState.keyState.state === 'saving'
                          ? {
                              ...connectionState,
                              keyState: {
                                ...connectionState.keyState,
                                state: 'ready',
                                valueChanged: false
                              }
                            }
                          : connectionState
                      )
                    }
                  }}
                >
                  Save
                </Button>
                <Button
                  danger
                  onClick={async () => {
                    if (
                      connectionState.keyState.state === 'ready' ||
                      connectionState.keyState.state === 'saving'
                    ) {
                      setConnectionState({
                        ...connectionState,
                        keyState: {
                          ...connectionState.keyState,
                          state: 'deleting'
                        }
                      })
                      await connectionState.db.delete(
                        connectionState.keyState.key
                      )
                      keyForm.resetFields()
                      setConnectionState({
                        ...connectionState,
                        keyState: {
                          state: 'new'
                        },
                        keys: await connectionState.db.getKeys()
                      })
                    }
                  }}
                >
                  Delete
                </Button>
              </Space>
            </Space>
          )
          break
        }

        default: {
          assertUnreachable(connectionState.keyState)
        }
      }
      break
    }

    case 'error':
    case 'retrying': {
      main = (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center'
          }}
        >
          <Space direction='vertical' size='large'>
            <div style={{ maxWidth: 600 }}>
              <Typography.Title level={2}>Connection Error</Typography.Title>
              <Typography.Text>
                There was an unexpected issue connecting to the "
                {connectionState.connection.name}" database. Maybe this message
                can help?
                <br />
                <code>{connectionState.error.message}</code>
              </Typography.Text>
            </div>

            <Space>
              <Button
                type='primary'
                loading={connectionState.state === 'retrying'}
                onClick={async () => {
                  try {
                    setConnectionState({
                      ...connectionState,
                      state: 'retrying'
                    })

                    const db = new S1(
                      connectionState.connection.token,
                      connectionState.connection.baseUrl
                    )
                    const keys = await db.getKeys()

                    keyForm.resetFields()
                    setConnectionState({
                      state: 'ready',
                      connection: connectionState.connection,
                      db,
                      keys,
                      keyState: { state: 'new' }
                    })
                  } catch (error) {
                    setConnectionState({
                      ...connectionState,
                      state: 'error',
                      error
                    })
                  }
                }}
              >
                Retry
              </Button>
              <Button
                disabled={connectionState.state === 'retrying'}
                onClick={() =>
                  setConnectionState({
                    state: 'idle'
                  })
                }
              >
                Go back
              </Button>
            </Space>
          </Space>
        </div>
      )
      break
    }

    default: {
      assertUnreachable(connectionState)
    }
  }

  switch (connectionState.state) {
    case 'ready':
    case 'updating': {
      sider = (
        <>
          <Space style={{ margin: '10px 0' }}>
            <Button
              icon={<PlusOutlined />}
              type='primary'
              onClick={() => {
                keyForm.resetFields()
                setConnectionState({
                  ...connectionState,
                  keyState: {
                    state: 'new'
                  }
                })
              }}
            >
              New
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={async () => {
                setConnectionState({
                  ...connectionState,
                  state: 'updating'
                })
                setConnectionState({
                  ...connectionState,
                  state: 'ready',
                  keys: await connectionState.db.getKeys()
                })
              }}
              loading={connectionState.state === 'updating'}
            >
              Refresh
            </Button>
          </Space>

          <Menu
            mode='inline'
            selectedKeys={
              // @ts-ignore
              connectionState.keyState.key ? [connectionState.keyState.key] : []
            }
          >
            {connectionState.keys.map((key) => (
              <Menu.Item
                icon={<FileTextOutlined />}
                key={key}
                onClick={async () => {
                  const loadingState: ConnectionState = {
                    ...connectionState,
                    keyState: {
                      state: 'loading',
                      key
                    }
                  }
                  setConnectionState(loadingState)

                  const value = await connectionState.db.getRaw(key)
                  setConnectionState((connectionState) =>
                    connectionState === loadingState
                      ? {
                          ...connectionState,
                          keyState: {
                            state: 'ready',
                            key,
                            value: tryFormat(value),
                            valueChanged: false
                          }
                        }
                      : connectionState
                  )
                }}
              >
                {key}
              </Menu.Item>
            ))}
          </Menu>
        </>
      )
      break
    }

    default: {
      sider = (
        <>
          {connections.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 16px' }}>
              <Typography.Title level={4}>Get Started</Typography.Title>
              <Typography.Text style={{ display: 'block', marginBottom: 10 }}>
                Create a connection in the main area to get started.
              </Typography.Text>
              <Typography.Text>
                <a href='https://s1.kognise.dev/token' target='_blank'>
                  New token
                </a>
              </Typography.Text>
            </div>
          )}

          <Menu mode='inline'>
            {connections.map((connection) => (
              <Menu.Item
                icon={<DatabaseFilled />}
                key={connection.id}
                onClick={() => {
                  setExisting(connection)
                  connectionForm.setFieldsValue({ ...connection, save: false })
                }}
              >
                {connection.name}
              </Menu.Item>
            ))}
          </Menu>
        </>
      )
    }
  }

  switch (connectionState.state) {
    case 'ready':
    case 'updating': {
      header = (
        <Button
          danger
          type='primary'
          onClick={() => {
            setConnectionState({ state: 'idle' })
            connectionForm.resetFields()
          }}
        >
          Disconnect
        </Button>
      )
      break
    }

    default: {
      header = (
        <Button
          icon={<PlusOutlined />}
          type='primary'
          onClick={() => {
            connectionForm.resetFields()
            setExisting(null)
            setConnectionState({ state: 'idle' })
          }}
        >
          New connection
        </Button>
      )
    }
  }

  return (
    <Layout>
      <Head>
        <title>S1 Dashboard</title>
      </Head>

      <Layout.Header
        style={{ display: 'flex', alignItems: 'center', paddingLeft: 24 }}
      >
        <div style={{ flex: 1 }}>
          <Typography.Title
            style={{
              color: '#ffffff',
              fontSize: '1.3rem',
              marginBottom: 0,
              lineHeight: 1
            }}
          >
            S1 Dashboard
          </Typography.Title>
        </div>
        {header}
      </Layout.Header>

      <Layout>
        <Layout.Sider
          theme='light'
          breakpoint='lg'
          collapsedWidth='0'
          width='260'
          style={{ overflow: 'auto' }}
        >
          {sider}
        </Layout.Sider>

        <Layout.Content>{main}</Layout.Content>
      </Layout>
    </Layout>
  )
}
