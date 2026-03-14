/**
 * DTI+ CIEL - Express Server
 * Serves the web interface and handles DTI+ generation requests.
 *
 * SECURITY: Credentials are never stored, logged, or persisted.
 * They exist only in memory during the request lifecycle.
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const archiver = require('archiver');
const { generateAllPeriods, VALID_LIBELLES } = require('./generator');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    }
  }
}));

// Request logging (no body logging to protect credentials)
app.use(morgan(':method :url :status :response-time ms'));

// Body parsing with strict size limit
app.use(express.json({ limit: '50kb' }));

// Rate limiting on generation endpoint
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Trop de requetes. Reessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Validation helpers
function validatePeriod(str) {
  return typeof str === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(str);
}

function validateAgrement(str) {
  return typeof str === 'string' && /^[A-Za-z]{2}[0-9A-Za-z]{11}$/.test(str);
}

// Concurrency limiter
let activeGenerations = 0;
const MAX_CONCURRENT = 3;

app.post('/api/generate', generateLimiter, async (req, res) => {
  const { apiUser, apiPass, agrement, produits, startDate, endDate } = req.body;

  // Request timeout (2 minutes)
  req.setTimeout(120000);
  res.setTimeout(120000);

  // Concurrency check
  if (activeGenerations >= MAX_CONCURRENT) {
    return res.status(503).json({ error: 'Serveur occupe. Reessayez dans quelques instants.' });
  }

  // Validate credential types and length
  if (!apiUser || typeof apiUser !== 'string' || apiUser.length > 500) {
    return res.status(400).json({ error: 'Identifiant API invalide' });
  }
  if (!apiPass || typeof apiPass !== 'string' || apiPass.length > 500) {
    return res.status(400).json({ error: 'Mot de passe API invalide' });
  }
  if (!validateAgrement(agrement)) {
    return res.status(400).json({ error: 'Numero d\'agrement invalide (format: 2 lettres + 11 caracteres alphanumeriques)' });
  }
  if (!Array.isArray(produits) || produits.length === 0 || produits.length > 50) {
    return res.status(400).json({ error: 'Entre 1 et 50 produits requis' });
  }
  if (!validatePeriod(startDate) || !validatePeriod(endDate)) {
    return res.status(400).json({ error: 'Dates invalides (format: YYYY-MM)' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'La date de debut doit etre anterieure a la date de fin' });
  }

  // Validate each product
  for (const p of produits) {
    if (!p.nom || typeof p.nom !== 'string' || p.nom.length > 200) {
      return res.status(400).json({ error: 'Nom de produit invalide (max 200 caracteres)' });
    }
    if (typeof p.tav !== 'number' || p.tav < 0 || p.tav > 100) {
      return res.status(400).json({ error: `TAV invalide pour "${p.nom}"` });
    }
    if (p.libelleFiscal && !VALID_LIBELLES.includes(p.libelleFiscal)) {
      return res.status(400).json({ error: `Libelle fiscal invalide pour "${p.nom}"` });
    }
  }

  // Abort if client disconnects
  let aborted = false;
  req.on('close', () => { aborted = true; });

  activeGenerations++;
  try {
    const files = await generateAllPeriods({
      apiUser,
      apiPass,
      agrement,
      produits,
      startDate,
      endDate,
      isAborted: () => aborted
    });

    if (aborted) return;

    // Stream zip directly to response - no temp files
    const safeName = `dti-plus_${startDate}_${endDate}.zip`.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}"`
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const file of files) {
      archive.append(file.content, { name: file.filename });
    }

    await archive.finalize();
  } catch (err) {
    // Sanitize error messages - never expose internal details
    const msg = err.message || '';
    let userMessage;
    let status;

    if (msg.includes('invalides')) {
      userMessage = 'Identifiants EasyBeer invalides';
      status = 401;
    } else if (msg.includes('Connexion') || msg.includes('API')) {
      userMessage = 'Service EasyBeer indisponible';
      status = 502;
    } else if (msg.includes('Plage') || msg.includes('Maximum')) {
      userMessage = msg;
      status = 400;
    } else {
      userMessage = 'Erreur lors de la generation';
      status = 500;
    }

    console.error('Generation error:', msg);

    if (!res.headersSent) {
      res.status(status).json({ error: userMessage });
    }
  } finally {
    activeGenerations--;
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DTI+ CIEL server: http://localhost:${PORT}`);
});
