import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../nucleo/bitacora_sos.dart';
import '../nucleo/copia_evidencia.dart';
import '../nucleo/emergencia.dart';
import '../widgets/comunes.dart';

/// Ajustes → Modo emergencia → Mis evidencias: lo que el SOS guardó en el teléfono, por emergencia,
/// listo para presentarlo en una denuncia (con la constancia y la huella SHA-256 de cada archivo).
class PantallaEvidencias extends StatefulWidget {
  const PantallaEvidencias({super.key});

  @override
  State<PantallaEvidencias> createState() => _PantallaEvidenciasState();
}

class _PantallaEvidenciasState extends State<PantallaEvidencias> {
  List<GrupoEvidencia>? _grupos;
  var _permiso = true;

  /// La emergencia cuya constancia se está armando (revisar huellas de varios MB tarda un poco).
  String? _preparando;
  final _abiertos = <String>{};

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final permiso = await CopiaEvidencia.permiso();
    final archivos = await CopiaEvidencia.listar();
    final bitacoras = await Bitacoras.todas();
    if (!mounted) return;
    setState(() {
      _permiso = permiso;
      _grupos = agruparEvidencias(archivos, bitacoras);
    });
  }

  /// Revisa la huella de cada archivo contra la de cuando se grabó (y la del servidor, si todavía
  /// la tiene) y deja la constancia en la carpeta de la emergencia.
  Future<({String texto, String? uri})> _constancia(GrupoEvidencia g) async {
    final servicio = AlcanceSos.leer(context).servicio;
    final huellas = <String, String>{};
    for (final a in g.archivos) {
      final h = await CopiaEvidencia.huella(a.uri);
      if (h != null) huellas[a.uri] = h;
    }
    final b = g.bitacora;
    final enServidor = <String, DateTime>{};
    if (b != null) {
      try {
        for (final v in await servicio.evidenciasEmergencia(b.id)) {
          if (v.sha256 != null) enServidor[v.sha256!] = v.creadaEn.toLocal();
        }
      } catch (_) {
        // Sin conexión, o el servidor ya la borró (30 días): la constancia sale igual
      }
    }
    final texto = constanciaSos(
      carpeta: g.carpeta,
      bitacora: b,
      enTelefono: g.archivos,
      huellas: huellas,
      enServidor: enServidor,
      ahora: DateTime.now(),
    );
    final guardada = await CopiaEvidencia.guardarTexto(
      texto,
      carpeta: g.carpeta,
      reemplazar: b?.constanciaUri ?? g.constancia?.uri,
    );
    if (b != null && guardada != null && b.constanciaUri != guardada.uri) {
      b.constanciaUri = guardada.uri;
      await Bitacoras.guardar(b);
    }
    return (texto: texto, uri: guardada?.uri);
  }

  Future<void> _compartir(GrupoEvidencia g) async {
    setState(() => _preparando = g.carpeta);
    try {
      final c = await _constancia(g);
      final uris = [for (final a in g.archivos) a.uri, ?c.uri];
      final enviada = uris.isNotEmpty && await CopiaEvidencia.compartir(uris, 'Evidencia ${_titulo(g)}');
      // Sin nada que mandar (o sin app para compartir): al menos se ve y se puede copiar
      if (!enviada && mounted) await _verTexto(c.texto);
    } finally {
      if (mounted) setState(() => _preparando = null);
      await _cargar();
    }
  }

  Future<void> _verConstancia(GrupoEvidencia g) async {
    setState(() => _preparando = g.carpeta);
    try {
      final c = await _constancia(g);
      if (mounted) await _verTexto(c.texto);
    } finally {
      if (mounted) setState(() => _preparando = null);
      await _cargar();
    }
  }

  Future<void> _verTexto(String texto) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Constancia'),
      content: SingleChildScrollView(
        child: SelectableText(texto, style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
      ),
      actions: [
        TextButton(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: texto));
            mostrarMensaje('Constancia copiada.');
          },
          child: const Text('Copiar'),
        ),
        FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar')),
      ],
    ),
  );

  String _titulo(GrupoEvidencia g) => 'SOS ${DateFormat('dd/MM/yyyy HH:mm').format(g.inicio)}';

  @override
  Widget build(BuildContext context) {
    final grupos = _grupos;
    return Scaffold(
      appBar: AppBar(title: const Text('Mis evidencias')),
      body: RefreshIndicator(
        onRefresh: _cargar,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            const Card(
              margin: EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Para presentar en una denuncia', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    SizedBox(height: 8),
                    Text(
                      'Cada vez que pides ayuda con el SOS, el teléfono guarda una copia de los videos y audios en '
                      '${CopiaEvidencia.ubicacion} (los videos también salen en tu galería). El servidor borra la suya '
                      '30 días después de cerrar la emergencia: esta copia es tuya y solo tú decides con quién '
                      'compartirla.',
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Para una denuncia ante el Ministerio Público toca «Compartir para la denuncia»: manda los '
                      'archivos y una constancia con las horas, los lugares y la huella SHA-256 de cada archivo. '
                      'También puedes copiar la carpeta a una USB. No los edites ni los recortes: cualquier cambio '
                      'altera su huella.',
                    ),
                  ],
                ),
              ),
            ),
            if (!_permiso && CopiaEvidencia.disponible)
              Card(
                margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                color: const Color(0xFFFFF4E5),
                child: ListTile(
                  leading: const Icon(Icons.sd_storage_outlined, color: Colores.naranja),
                  title: const Text('¿Reinstalaste la app?'),
                  subtitle: const Text('Permite leer videos y audios para encontrar la evidencia guardada antes.'),
                  trailing: TextButton(
                    onPressed: () async {
                      await CopiaEvidencia.pedirPermiso();
                      await _cargar();
                    },
                    child: const Text('Permitir'),
                  ),
                ),
              ),
            if (grupos == null)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (grupos.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  CopiaEvidencia.disponible
                      ? 'Todavía no hay evidencia guardada. Cuando uses el SOS, los videos y audios aparecerán aquí '
                            'y en ${CopiaEvidencia.ubicacion}.'
                      : 'La copia de la evidencia en el teléfono funciona en la app de Android.',
                  textAlign: TextAlign.center,
                ),
              )
            else
              for (final g in grupos) _tarjeta(g),
          ],
        ),
      ),
    );
  }

  Widget _tarjeta(GrupoEvidencia g) {
    final b = g.bitacora;
    final abierto = _abiertos.contains(g.carpeta);
    final libre = _preparando == null;
    final resumen = [
      if (g.videos > 0) '${g.videos} ${g.videos == 1 ? 'video' : 'videos'}',
      if (g.audios > 0) '${g.audios} ${g.audios == 1 ? 'audio' : 'audios'}',
      if (g.archivos.isNotEmpty) tamanoLegible(g.bytes),
    ];
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.sos, color: Colores.rojo),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_titulo(g), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(resumen.isEmpty ? 'Sin copia de video ni audio en el teléfono' : resumen.join(' · ')),
            if (b != null)
              Text(
                [
                  if (b.tipo != TipoEmergencia.sos) b.tipo.enPrimeraPersona,
                  b.cierre ?? 'Sin cierre registrado',
                ].join(' · '),
                style: const TextStyle(color: Colores.gris, fontSize: 13),
              ),
            if (_preparando == g.carpeta) ...[
              const SizedBox(height: 8),
              const LinearProgressIndicator(),
              const Text('Revisando la huella de cada archivo…', style: TextStyle(fontSize: 12.5)),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                FilledButton.icon(
                  onPressed: libre ? () => _compartir(g) : null,
                  icon: const Icon(Icons.share),
                  label: const Text('Compartir para la denuncia'),
                ),
                OutlinedButton(onPressed: libre ? () => _verConstancia(g) : null, child: const Text('Constancia')),
                if (g.archivos.isNotEmpty)
                  TextButton(
                    onPressed: () => setState(() => abierto ? _abiertos.remove(g.carpeta) : _abiertos.add(g.carpeta)),
                    child: Text(abierto ? 'Ocultar archivos' : 'Ver archivos'),
                  ),
              ],
            ),
            if (abierto)
              for (final a in g.archivos)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(a.esVideo ? Icons.videocam : Icons.mic),
                  title: Text(a.nombre),
                  subtitle: Text(tamanoLegible(a.bytes)),
                  trailing: TextButton(
                    onPressed: () async {
                      if (!await CopiaEvidencia.abrir(a)) mostrarMensaje('No hay una app para abrirlo.', error: true);
                    },
                    child: const Text('Ver'),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
