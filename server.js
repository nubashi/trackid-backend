const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Configurar multer para subir archivos a /uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitizedFilename = file.originalname.replace(/[^a-z0-9_.\-() ]/gi, '');
    cb(null, `${timestamp}-${sanitizedFilename}`);
  }
});
const upload = multer({ storage });

// 👉 Ruta principal
app.get('/', (req, res) => {
  res.send('Servidor activo para análisis de audio 🎶');
});

// 🎧 Ruta para subir audio y analizarlo
app.post('/analyze', upload.single('audioFile'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Archivo no proporcionado' });
    }

    console.log('🧾 Archivos recibidos:', file);

    // Ejecutar fpcalc
    const command = `fpcalc -json "${file.path}"`;
    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error al generar fingerprint:', stderr || error.message);
        return res.status(500).json({ error: 'Error al generar fingerprint' });
      }

      const { fingerprint, duration } = JSON.parse(stdout);
      if (!fingerprint || !duration) {
        return res.status(400).json({ error: 'Fingerprint inválido' });
      }

      console.log(`🎧 Generando huella digital para: ${file.originalname}`);
      console.log('🔍 Consultando AcoustID con duración:', duration);

      try {
        const response = await axios.get('https://api.acoustid.org/v2/lookup', {
          params: {
            client: 'P9ctseKGzA',
            meta: 'recordings+recordingids+releaseids+releases+tracks',
            duration: duration,
            fingerprint: fingerprint,
            format: 'json'
          }
        });

        const data = response.data;

        if (data.status === 'ok') {
          return res.status(200).json({ result: data });
        } else {
          return res.status(400).json({ error: data.error || 'No se pudo identificar el audio' });
        }
      } catch (apiError) {
        console.error('❌ Error al consultar AcoustID:', apiError.message);
        return res.status(500).json({ error: 'Error al consultar AcoustID', details: apiError.message });
      }
    });

  } catch (err) {
    console.error('❌ Error general:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 🚀 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend ejecutándose en http://localhost:${PORT}`);
});
