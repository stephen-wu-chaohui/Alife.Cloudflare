import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const EMPTY_VALUE = '-'

function formatBytes(size) {
  if (!Number.isFinite(size) || size < 0) {
    return EMPTY_VALUE
  }
  if (size === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(isoLike) {
  if (!isoLike) {
    return EMPTY_VALUE
  }

  const date = new Date(isoLike)
  if (Number.isNaN(date.getTime())) {
    return EMPTY_VALUE
  }

  return date.toLocaleString()
}

function buildInfoLine({ type, size, updatedAt, width, height }) {
  const tokens = []
  tokens.push(`Type: ${type || EMPTY_VALUE}`)
  tokens.push(`Size: ${formatBytes(size)}`)
  tokens.push(`Updated: ${formatDate(updatedAt)}`)
  if (width && height) {
    tokens.push(`Dimension: ${width}x${height}`)
  }
  return tokens.join(' | ')
}

function loadImageDimension(url) {
  return new Promise((resolve) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      })
    }

    image.onerror = () => {
      resolve({
        width: null,
        height: null,
      })
    }

    image.src = url
  })
}

async function buildInfoFromFile(file) {
  const objectUrl = URL.createObjectURL(file)
  const dimension = await loadImageDimension(objectUrl)
  URL.revokeObjectURL(objectUrl)

  return buildInfoLine({
    type: file.type || EMPTY_VALUE,
    size: file.size,
    updatedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    width: dimension.width,
    height: dimension.height,
  })
}

function normalizeAccessUrl(value) {
  if (!value) {
    return EMPTY_VALUE
  }
  return value
}

function App() {
  const fileInputRef = useRef(null)
  const [images, setImages] = useState([])
  const [config, setConfig] = useState(null)
  const [selectedKey, setSelectedKey] = useState('')
  const [status, setStatus] = useState('Loading image list...')
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [fsPathLine, setFsPathLine] = useState(EMPTY_VALUE)
  const [urlLine, setUrlLine] = useState(EMPTY_VALUE)
  const [infoLine, setInfoLine] = useState(EMPTY_VALUE)

  const selectedImage = useMemo(
    () => images.find((item) => item.key === selectedKey) ?? null,
    [images, selectedKey],
  )

  function applyImageSelection(image) {
    if (!image) {
      setSelectedKey('')
      setFsPathLine(EMPTY_VALUE)
      setUrlLine(EMPTY_VALUE)
      setInfoLine(EMPTY_VALUE)
      return
    }

    setSelectedKey(image.key)
    setFsPathLine(`Bucket key: ${image.key}`)
    setUrlLine(normalizeAccessUrl(image.url))
    setInfoLine(
      buildInfoLine({
        type: image.contentType,
        size: image.size,
        updatedAt: image.uploaded,
      }),
    )
  }

  async function refreshImages({ keepCurrentSelection = true } = {}) {
    setIsLoading(true)
    const response = await fetch('/api/images')
    if (!response.ok) {
      throw new Error(`Unable to load images (${response.status})`)
    }

    const payload = await response.json()
    const items = Array.isArray(payload.images) ? payload.images : []
    setImages(items)
    setStatus(`Loaded ${items.length} image(s).`)

    if (!keepCurrentSelection) {
      applyImageSelection(null)
    } else if (selectedKey) {
      const stillExists = items.find((image) => image.key === selectedKey)
      if (!stillExists) {
        applyImageSelection(null)
      }
    }

    setIsLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const [configResponse, imagesResponse] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/images'),
        ])

        if (!configResponse.ok) {
          throw new Error(`Unable to load config (${configResponse.status})`)
        }
        if (!imagesResponse.ok) {
          throw new Error(`Unable to load images (${imagesResponse.status})`)
        }

        const configPayload = await configResponse.json()
        const imagesPayload = await imagesResponse.json()
        const items = Array.isArray(imagesPayload.images) ? imagesPayload.images : []

        if (cancelled) {
          return
        }

        setConfig(configPayload)
        setImages(items)
        setStatus(`Loaded ${items.length} image(s).`)
        setIsLoading(false)
      } catch (error) {
        if (!cancelled) {
          setStatus(error.message)
          setIsLoading(false)
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleDelete() {
    if (!selectedImage || isDeleting) {
      return
    }

    setIsDeleting(true)

    try {
      const response = await fetch(`/api/images/${encodeURIComponent(selectedImage.key)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`Delete failed (${response.status})`)
      }

      setStatus(`Deleted "${selectedImage.key}".`)
      await refreshImages({ keepCurrentSelection: false })
    } catch (error) {
      setStatus(error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  function handleUploadClick() {
    if (isUploading) {
      return
    }
    fileInputRef.current?.click()
  }

  async function handleFilePicked(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setIsUploading(true)
    setStatus(`Uploading "${file.name}"...`)

    const pseudoPath = file.webkitRelativePath || file.name
    setFsPathLine(pseudoPath || EMPTY_VALUE)
    setUrlLine(EMPTY_VALUE)
    setInfoLine(await buildInfoFromFile(file))

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/images', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`)
      }

      const payload = await response.json()
      const uploaded = payload?.image

      if (!uploaded?.key) {
        throw new Error('Upload response is missing image metadata.')
      }

      await refreshImages({ keepCurrentSelection: true })
      applyImageSelection(uploaded)
      setFsPathLine(pseudoPath || EMPTY_VALUE)
      setStatus(`Uploaded "${uploaded.key}".`)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Cloudflare Bucket Image Browser</h1>
        <p className="status">{status}</p>
        <p className="config-line">
          Bucket: {config?.bucketName || EMPTY_VALUE} | Public URL Base:{' '}
          {config?.publicBaseUrl || EMPTY_VALUE}
        </p>
      </header>

      <section className="image-list-wrap">
        <h2>Root Directory Images</h2>
        {isLoading ? <p>Loading...</p> : null}

        {!isLoading && images.length === 0 ? (
          <p>No images found in bucket root.</p>
        ) : (
          <ul className="image-grid" role="list">
            {images.map((image) => (
              <li
                key={image.key}
                className={`image-card ${selectedKey === image.key ? 'selected' : ''}`}
              >
                <button
                  type="button"
                  className="image-select"
                  onClick={() => applyImageSelection(image)}
                >
                  <img
                    src={image.url}
                    alt={image.key}
                    loading="lazy"
                    className="preview-image"
                  />
                  <span className="image-key">{image.key}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="actions">
        <button
          type="button"
          className="action-button danger"
          onClick={handleDelete}
          disabled={!selectedImage || isDeleting || isUploading}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
        <button
          type="button"
          className="action-button primary"
          onClick={handleUploadClick}
          disabled={isUploading || isDeleting}
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFilePicked}
          hidden
        />
      </section>

      <section className="details">
        <p>
          <strong>File path in FS:</strong> {fsPathLine}
        </p>
        <p>
          <strong>Image URL:</strong> {urlLine}
        </p>
        <p>
          <strong>Basic image info:</strong> {infoLine}
        </p>
      </section>
    </main>
  )
}

export default App
