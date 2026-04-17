const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'ico',
])

const TYPE_BY_EXTENSION = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function getKeyExtension(key) {
  const tokens = key.toLowerCase().split('.')
  return tokens.length > 1 ? tokens.at(-1) : ''
}

function isImageObject(objectKey, contentType) {
  if (typeof contentType === 'string' && contentType.startsWith('image/')) {
    return true
  }

  return IMAGE_EXTENSIONS.has(getKeyExtension(objectKey))
}

function keyToUrlPath(key) {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function toImageUrl(request, env, key) {
  const base = typeof env.R2_PUBLIC_BASE_URL === 'string' ? env.R2_PUBLIC_BASE_URL.trim() : ''
  const path = keyToUrlPath(key)

  if (base) {
    return `${base.replace(/\/$/, '')}/${path}`
  }

  const origin = new URL(request.url).origin
  return `${origin}/api/images/object/${encodeURIComponent(key)}`
}

function sanitizeFileName(name) {
  const trimmed = name.trim()
  if (!trimmed) {
    return `upload-${Date.now()}`
  }

  return trimmed
    .replace(/\\/g, '/')
    .split('/')
    .at(-1)
    .replace(/\s+/g, '-')
}

async function listImages(request, env) {
  const configuredLimit = Number.parseInt(env.BUCKET_LIST_LIMIT ?? '500', 10)
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 500

  const listing = await env.IMAGE_BUCKET.list({
    delimiter: '/',
    limit,
  })

  const images = listing.objects
    .filter((object) => isImageObject(object.key, object.httpMetadata?.contentType))
    .map((object) => ({
      key: object.key,
      size: object.size,
      uploaded: object.uploaded,
      etag: object.httpEtag,
      contentType: object.httpMetadata?.contentType || TYPE_BY_EXTENSION[getKeyExtension(object.key)] || EMPTY,
      url: toImageUrl(request, env, object.key),
    }))
    .sort((left, right) => String(right.uploaded).localeCompare(String(left.uploaded)))

  return json({ images })
}

async function uploadImage(request, env) {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return json({ error: 'Use multipart/form-data with field name "file".' }, 400)
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return json({ error: 'Missing file field.' }, 400)
  }

  const extension = getKeyExtension(file.name)
  const candidateType = file.type || TYPE_BY_EXTENSION[extension] || ''
  if (!isImageObject(file.name, candidateType)) {
    return json({ error: 'Only image files can be uploaded.' }, 400)
  }

  const key = sanitizeFileName(file.name)

  await env.IMAGE_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: candidateType || 'application/octet-stream',
    },
  })

  const uploadedObject = await env.IMAGE_BUCKET.head(key)

  return json(
    {
      image: {
        key,
        size: uploadedObject?.size ?? file.size,
        uploaded: uploadedObject?.uploaded ?? new Date().toISOString(),
        contentType: uploadedObject?.httpMetadata?.contentType || candidateType || EMPTY,
        url: toImageUrl(request, env, key),
      },
    },
    201,
  )
}

async function deleteImage(request, env, pathname) {
  const encodedKey = pathname.slice('/api/images/'.length)
  const key = decodeURIComponent(encodedKey)

  if (!key) {
    return json({ error: 'Image key is required.' }, 400)
  }

  await env.IMAGE_BUCKET.delete(key)
  return json({ deleted: key })
}

async function fetchObject(request, env, pathname) {
  const encodedKey = pathname.slice('/api/images/object/'.length)
  const key = decodeURIComponent(encodedKey)

  if (!key) {
    return json({ error: 'Image key is required.' }, 400)
  }

  const object = await env.IMAGE_BUCKET.get(key)
  if (!object) {
    return json({ error: 'Image not found.' }, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=300')

  return new Response(object.body, {
    status: 200,
    headers,
  })
}

function configResponse(env) {
  return json({
    bucketBinding: 'IMAGE_BUCKET',
    bucketName: env.R2_BUCKET_NAME ?? EMPTY,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? EMPTY,
    listLimit: env.BUCKET_LIST_LIMIT ?? '500',
  })
}

const EMPTY = ''

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    try {
      if (url.pathname === '/api/config' && request.method === 'GET') {
        return configResponse(env)
      }

      if (url.pathname === '/api/images' && request.method === 'GET') {
        return listImages(request, env)
      }

      if (url.pathname === '/api/images' && request.method === 'POST') {
        return uploadImage(request, env)
      }

      if (url.pathname.startsWith('/api/images/object/') && request.method === 'GET') {
        return fetchObject(request, env, url.pathname)
      }

      if (url.pathname.startsWith('/api/images/') && request.method === 'DELETE') {
        return deleteImage(request, env, url.pathname)
      }

      return json({ error: 'Not found.' }, 404)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unexpected error.' }, 500)
    }
  },
}