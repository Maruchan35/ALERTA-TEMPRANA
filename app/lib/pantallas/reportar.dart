import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';

import '../config.dart';
import '../nucleo/estado_app.dart';
import '../widgets/comunes.dart';
import 'detalle.dart';
import 'verificar_telefono.dart';

/// 4. Reportar en 3 pasos: qué pasa → dónde → detalles. Las reglas de confianza
/// (cuenta verificada, límite por hora, duplicados, estado inicial) las aplica el servidor.
class PantallaReportar extends StatefulWidget {
  const PantallaReportar({super.key});

  @override
  State<PantallaReportar> createState() => _PantallaReportarState();
}

class _PantallaReportarState extends State<PantallaReportar> {
  final _paginas = PageController();
  final _mapa = MapController();
  final _titulo = TextEditingController();
  final _descripcion = TextEditingController();
  final _referencia = TextEditingController();
  final _folio = TextEditingController();
  var _paso = 0;
  Categoria? _categoria;
  LatLng? _punto;
  Uint8List? _foto;
  var _veraz = false;
  var _consentimiento = false;
  var _enviando = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _verificarCuenta());
  }

  @override
  void dispose() {
    for (final c in [_titulo, _descripcion, _referencia, _folio]) {
      c.dispose();
    }
    _paginas.dispose();
    super.dispose();
  }

  /// Para reportar se necesita una cuenta verificada (1 número = 1 cuenta).
  Future<void> _verificarCuenta() async {
    final estado = AlcanceApp.leer(context);
    if (!(estado.perfil?.esAnonimo ?? true)) return;
    final ok = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => const PantallaVerificarTelefono(motivo: 'reportar')),
    );
    if (ok != true && mounted) Navigator.pop(context);
  }

  void _ir(int paso) {
    FocusScope.of(context).unfocus();
    setState(() => _paso = paso);
    _paginas.animateToPage(paso, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
  }

  Future<void> _elegirFoto(ImageSource fuente) async {
    final archivo = await ImagePicker().pickImage(source: fuente, maxWidth: 2560, maxHeight: 2560);
    if (archivo == null) return;
    var bytes = await archivo.readAsBytes();
    if (!kIsWeb) {
      // Recomprimir quita los metadatos EXIF (GPS, modelo del teléfono) antes de subir
      bytes = await FlutterImageCompress.compressWithList(
        bytes,
        minWidth: 1280,
        minHeight: 1280,
        quality: 75,
        keepExif: false,
        format: CompressFormat.jpeg,
      );
    }
    setState(() => _foto = bytes);
  }

  Future<void> _enviar() async {
    final estado = AlcanceApp.leer(context);
    final cat = _categoria!;
    final punto = _punto!;
    setState(() => _enviando = true);
    try {
      String? ruta;
      if (_foto != null) ruta = await estado.servicio.subirFoto(_foto!);
      final r = await estado.servicio.crearReporte(
        NuevoReporte(
          categoria: cat.clave,
          titulo: _titulo.text,
          descripcion: _descripcion.text,
          referencia: _referencia.text,
          lat: punto.latitude,
          lon: punto.longitude,
          fotoPath: ruta,
          folio911: _folio.text.trim().isEmpty ? null : _folio.text.trim(),
          consentimiento: _consentimiento,
        ),
      );
      estado.programarRecarga();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: Icon(
            r.esDuplicado
                ? Icons.group_add
                : (r.estado == EstadoAlerta.pendiente ? Icons.hourglass_top : Icons.check_circle),
            size: 40,
            color: r.estado == EstadoAlerta.pendiente ? Colores.morado : Colores.verde,
          ),
          title: Text(
            r.esDuplicado
                ? 'Ya lo habían reportado'
                : r.estado == EstadoAlerta.pendiente
                ? 'Reporte en revisión'
                : 'Reporte publicado',
          ),
          content: Text(r.mensaje),
          actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Entendido'))],
        ),
      );
      if (!mounted) return;
      final id = r.alertaId ?? r.duplicadaDe;
      Navigator.pop(context);
      if (id != null) {
        Navigator.push(context, MaterialPageRoute<void>(builder: (_) => PantallaDetalle(alertaId: id)));
      }
    } on ErrorServicio catch (e) {
      mostrarMensaje(e.mensaje, error: true);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Reportar · paso ${_paso + 1} de 3'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(4),
          child: LinearProgressIndicator(value: (_paso + 1) / 3, color: Colores.rojo, backgroundColor: Colors.white24),
        ),
      ),
      body: PageView(
        controller: _paginas,
        physics: const NeverScrollableScrollPhysics(),
        children: [_pasoCategoria(), _pasoLugar(), _pasoDetalles()],
      ),
    );
  }

  // ─── Paso 1: ¿Qué está pasando? ────────────────────────────────────────────
  Widget _pasoCategoria() {
    final estado = AlcanceApp.of(context);
    final institucion = estado.perfil?.rol.esValidador ?? false;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text('¿Qué está pasando?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.05,
                children: [
                  for (final c in catalogo)
                    _BotonCategoria(
                      categoria: c,
                      habilitada: !c.soloInstitucion || institucion,
                      seleccionada: _categoria?.clave == c.clave,
                      alPresionar: () => setState(() => _categoria = c),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Grises: solo instituciones. Los reportes falsos bajan tu reputación y pueden suspender tu cuenta.',
                style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700, fontStyle: FontStyle.italic),
              ),
              if (_categoria != null) ...[
                const SizedBox(height: 12),
                _NotaCategoria(categoria: _categoria!, institucion: institucion),
              ],
            ],
          ),
        ),
        _BarraInferior(
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
            onPressed: _categoria == null ? null : () => _ir(1),
            child: const Text('Siguiente'),
          ),
        ),
      ],
    );
  }

  // ─── Paso 2: ¿Dónde? ───────────────────────────────────────────────────────
  Widget _pasoLugar() {
    final estado = AlcanceApp.of(context);
    final pos = estado.miPosicion;
    final inicio = LatLng(pos?.lat ?? Config.latInicial, pos?.lon ?? Config.lonInicial);
    return Column(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Text(
            'Mueve el mapa hasta que el pin quede donde ocurrió.',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        Expanded(
          child: Stack(
            alignment: Alignment.center,
            children: [
              FlutterMap(
                mapController: _mapa,
                options: MapOptions(
                  initialCenter: inicio,
                  initialZoom: 16,
                  interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'mx.alertacerca.alerta_cerca',
                  ),
                  const SimpleAttributionWidget(source: Text('colaboradores de OpenStreetMap')),
                ],
              ),
              const IgnorePointer(
                child: Padding(
                  padding: EdgeInsets.only(bottom: 44),
                  child: Icon(Icons.location_on, size: 48, color: Colores.rojo),
                ),
              ),
              Positioned(
                right: 12,
                top: 12,
                child: FloatingActionButton.small(
                  heroTag: 'mi-ubicacion-reporte',
                  backgroundColor: Colors.white,
                  foregroundColor: Colores.marino,
                  tooltip: 'Usar mi ubicación',
                  onPressed: () => _mapa.move(inicio, 17),
                  child: const Icon(Icons.my_location),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: TextField(
            controller: _referencia,
            maxLength: 200,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Referencia (opcional)',
              hintText: 'Ej. frente al mercado municipal',
              prefixIcon: Icon(Icons.place_outlined),
            ),
          ),
        ),
        _BarraInferior(
          atras: () => _ir(0),
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
            onPressed: () {
              setState(() => _punto = _mapa.camera.center);
              _ir(2);
            },
            child: const Text('Siguiente'),
          ),
        ),
      ],
    );
  }

  // ─── Paso 3: detalles ──────────────────────────────────────────────────────
  Widget _pasoDetalles() {
    final cat = _categoria;
    final personas = cat?.esDePersonas ?? false;
    final estado = AlcanceApp.of(context);
    final fotosPermitidas = !kIsWeb || estado.servicio.esDemo;
    final listo = _titulo.text.trim().length >= 5 && _veraz && (_foto == null || !personas || _consentimiento);
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TextField(
                controller: _titulo,
                maxLength: 80,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Título *',
                  hintText: personas ? 'Ej. Niño de 8 años, playera roja' : 'Ej. Humo en una bodega',
                  helperText: 'Entre 5 y 80 caracteres. Sin nombres completos ni domicilios.',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _descripcion,
                maxLength: 1000,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Descripción',
                  hintText: 'Características, hacia dónde se dirigía, desde cuándo…',
                  alignLabelWithHint: true,
                ),
              ),
              if (personas) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _folio,
                  maxLength: 40,
                  decoration: const InputDecoration(
                    labelText: 'Folio del 911 o de la denuncia (recomendado)',
                    helperText: 'Ayuda al validador a confirmar el caso más rápido.',
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (_foto != null)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.memory(_foto!, height: 200, width: double.infinity, fit: BoxFit.cover),
                    ),
                    Positioned(
                      right: 8,
                      top: 8,
                      child: IconButton.filled(
                        tooltip: 'Quitar foto',
                        onPressed: () => setState(() => _foto = null),
                        icon: const Icon(Icons.close),
                      ),
                    ),
                  ],
                )
              else if (fotosPermitidas)
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _elegirFoto(ImageSource.camera),
                        icon: const Icon(Icons.photo_camera_outlined),
                        label: const Text('Tomar foto'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _elegirFoto(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined),
                        label: const Text('Galería'),
                      ),
                    ),
                  ],
                )
              else
                const Text('Las fotos se adjuntan desde la app móvil (ahí se les quitan los metadatos).'),
              if (_foto != null)
                const Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text(
                    'Quitamos la ubicación y los datos del teléfono de la foto antes de subirla.',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              const SizedBox(height: 8),
              if (personas)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _consentimiento,
                  onChanged: (v) => setState(() => _consentimiento = v ?? false),
                  title: const Text('Tengo el consentimiento del familiar o tutor para publicar la foto'),
                  subtitle: const Text('Nunca publiques domicilios. Sin consentimiento, no adjuntes foto.'),
                ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _veraz,
                onChanged: (v) => setState(() => _veraz = v ?? false),
                title: const Text('Confirmo que la información es verdadera'),
                subtitle: const Text('Tu número queda asociado al reporte. Nunca se muestra a otras personas.'),
              ),
              if (cat != null) _NotaCategoria(categoria: cat, institucion: estado.perfil?.rol.esValidador ?? false),
            ],
          ),
        ),
        _BarraInferior(
          atras: () => _ir(1),
          child: FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: Colores.rojo),
            onPressed: !listo || _enviando ? null : _enviar,
            icon: _enviando
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.send),
            label: const Text('Enviar reporte'),
          ),
        ),
      ],
    );
  }
}

class _BotonCategoria extends StatelessWidget {
  const _BotonCategoria({
    required this.categoria,
    required this.habilitada,
    required this.seleccionada,
    required this.alPresionar,
  });

  final Categoria categoria;
  final bool habilitada;
  final bool seleccionada;
  final VoidCallback alPresionar;

  @override
  Widget build(BuildContext context) {
    final color = habilitada ? colorNivel(categoria.nivel) : Colors.grey.shade400;
    return Semantics(
      button: true,
      selected: seleccionada,
      enabled: habilitada,
      label: categoria.nombre,
      child: Material(
        color: color,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: habilitada ? alPresionar : null,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: seleccionada ? Border.all(color: Colores.marino, width: 4) : null,
            ),
            padding: const EdgeInsets.all(6),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(iconoCategoria(categoria.clave), color: Colors.white, size: 30),
                const SizedBox(height: 6),
                Text(
                  categoria.etiqueta,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Explica qué pasará con el reporte según la categoría y quién reporta.
class _NotaCategoria extends StatelessWidget {
  const _NotaCategoria({required this.categoria, required this.institucion});

  final Categoria categoria;
  final bool institucion;

  @override
  Widget build(BuildContext context) {
    final texto = institucion
        ? 'Como institución, tu alerta sale VERIFICADA y usa todos los escalones de radio '
              '(hasta ${formatoRadio(categoria.radioMaximo)}).'
        : categoria.requiereValidacion
        ? 'Por seguridad, los casos de personas se revisan antes de difundirse (suele tomar minutos). '
              'Así evitamos que alguien use la app para encontrar a quien huyó de una situación de violencia.'
        : 'Se publicará como NO CONFIRMADO y llegará a 1 km a la redonda. Si 3 vecinos lo confirman o '
              'un validador lo verifica, llegará más lejos.';
    return Card(
      color: Colores.marino.withAlpha(16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.info_outline, color: Colores.marino),
            const SizedBox(width: 8),
            Expanded(child: Text(texto)),
          ],
        ),
      ),
    );
  }
}

class _BarraInferior extends StatelessWidget {
  const _BarraInferior({required this.child, this.atras});

  final Widget child;
  final VoidCallback? atras;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        children: [
          if (atras != null) ...[
            OutlinedButton(onPressed: atras, child: const Text('Atrás')),
            const SizedBox(width: 12),
          ],
          Expanded(child: child),
        ],
      ),
    ),
  );
}
