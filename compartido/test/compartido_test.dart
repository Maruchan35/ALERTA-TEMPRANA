import 'package:alerta_compartido/alerta_compartido.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('geohash (igual que PostGIS)', () {
    test('puntos de la demo', () {
      expect(geohash(17.9581, -102.1942), '9epq4t');
      expect(geohash(17.9608, -102.1942), '9epq4t');
      expect(geohash(17.9815, -102.1942), '9epq69');
      expect(geohash(18.0121, -102.1942), '9epq6x');
      expect(geohash(17.6417, -101.5517), '9epu35');
    });

    test('el centro de la celda está dentro de la celda', () {
      final (lat, lon) = centroDeGeohash('9epq4t');
      expect(geohash(lat, lon), '9epq4t');
      expect(distanciaMetros(lat, lon, 17.9581, -102.1942), lessThan(700));
    });

    test('celdas válidas', () {
      expect(esCeldaValida('9epq4t'), isTrue);
      expect(esCeldaValida('9epq4a'), isFalse);
      expect(esCeldaValida('9epq4'), isFalse);
    });
  });

  group('distancias', () {
    test('A está a ~300 m y D a ~76 km del suceso', () {
      expect(distanciaMetros(17.9581, -102.1942, 17.9608, -102.1942), closeTo(300, 5));
      expect(distanciaMetros(17.9581, -102.1942, 17.6417, -101.5517) / 1000, closeTo(76.6, 0.5));
    });

    test('formato', () {
      expect(formatoDistancia(452), '450 m');
      expect(formatoDistancia(1234), '1.2 km');
      expect(formatoDistancia(76600), '77 km');
      expect(formatoRadio(3000), '3 km');
      expect(formatoRadio(2500), '2.5 km');
    });
  });

  group('radio permitido (espejo de radio_permitido())', () {
    final menor = categoriaPorClave('menor_desaparecido');
    final robo = categoriaPorClave('robo_vehiculo');
    final t0 = DateTime(2026, 11, 14, 17);

    int radio(Categoria c, EstadoAlerta e, int minutos, {double factor = 1, int? manual}) => radioPermitido(
      categoria: c,
      estado: e,
      publicadaEn: t0,
      ahora: t0.add(Duration(minutes: minutos)),
      factorTiempo: factor,
      radioManualM: manual,
    );

    test('escalones de un menor verificado', () {
      expect(radio(menor, EstadoAlerta.verificada, 0), 1000);
      expect(radio(menor, EstadoAlerta.verificada, 15), 3000);
      expect(radio(menor, EstadoAlerta.verificada, 60), 10000);
      expect(radio(menor, EstadoAlerta.verificada, 180), 25000);
      expect(radio(menor, EstadoAlerta.verificada, 9000), 25000);
    });

    test('topes por confianza y estados sin difusión', () {
      expect(radio(robo, EstadoAlerta.noConfirmada, 0), 1000, reason: 'robo empieza en 3 km, tope 1 km');
      expect(radio(robo, EstadoAlerta.corroborada, 30), 3000);
      expect(radio(robo, EstadoAlerta.verificada, 30), 10000);
      expect(radio(menor, EstadoAlerta.pendiente, 30), 0);
      expect(radio(menor, EstadoAlerta.resuelta, 30), 0);
    });

    test('colmena: con 6 confirmaciones el tope de corroborada sube de 3 a 10 km', () {
      int corroborada(int n) => radioPermitido(
        categoria: robo,
        estado: EstadoAlerta.corroborada,
        publicadaEn: t0,
        ahora: t0.add(const Duration(minutes: 70)),
        nConfirmo: n,
      );
      expect(corroborada(3), 3000);
      expect(corroborada(5), 3000);
      expect(corroborada(6), 10000);
      expect(radio(menor, EstadoAlerta.noConfirmada, 30), 1000, reason: 'personas publicadas por la colmena: 1 km');
    });

    test('colmena: la foto de una persona solo se muestra confirmada', () {
      expect(fotoPublica(EstadoAlerta.noConfirmada, dePersonas: true), isFalse);
      expect(fotoPublica(EstadoAlerta.noConfirmada, dePersonas: false), isTrue);
      expect(fotoPublica(EstadoAlerta.corroborada, dePersonas: true), isTrue);
      expect(fotoPublica(EstadoAlerta.verificada, dePersonas: true), isTrue);
      expect(fotoPublica(EstadoAlerta.pendiente, dePersonas: false), isFalse);
      expect(fotoPublica(EstadoAlerta.resuelta, dePersonas: false), isFalse);
    });

    test('modo demo (factor 30) y radio manual', () {
      final t = t0.add(const Duration(seconds: 31));
      expect(
        radioPermitido(categoria: menor, estado: EstadoAlerta.verificada, publicadaEn: t0, ahora: t, factorTiempo: 30),
        3000,
      );
      expect(radio(menor, EstadoAlerta.verificada, 0, manual: 2000), 2000);
    });

    test('siguiente escalón', () {
      final s = siguienteEscalon(
        categoria: menor,
        estado: EstadoAlerta.verificada,
        publicadaEn: t0,
        ahora: t0.add(const Duration(minutes: 5)),
      );
      expect(s!.radioM, 3000);
      expect(s.falta, const Duration(minutes: 10));
    });
  });

  group('mensajes (espejo de datosPush de la Edge Function)', () {
    final a = Alerta(
      id: 'id-1',
      categoria: 'menor_desaparecido',
      nombre: 'Menor desaparecido o posible sustracción',
      nombreCorto: 'Menor desaparecido',
      nivel: 4,
      estado: EstadoAlerta.verificada,
      titulo: 'Niño de 8 años, playera roja',
      lat: 17.9581,
      lon: -102.1942,
      radioActualM: 1000,
      creadaEn: DateTime(2026),
      expiraEn: DateTime(2026, 1, 4),
    );

    test('nueva', () {
      expect(datosPush(a, 'nueva', radioM: 3000), {
        'tipo': 'nueva',
        'alerta_id': 'id-1',
        'categoria': 'menor_desaparecido',
        'nivel': '4',
        'estado': 'verificada',
        'titulo': 'MENOR DESAPARECIDO',
        'cuerpo': 'Niño de 8 años, playera roja',
        'lat': '17.9581',
        'lon': '-102.1942',
        'radio_m': '3000',
        'foto': '0',
      });
      expect(
        cuerpoConDistancia(distancia: '450 m', estado: 'verificada', cuerpo: 'Niño'),
        'A 450 m de ti · Verificada · Niño',
      );
    });

    test('cierre', () {
      final r = datosPush(a.copiar(estado: EstadoAlerta.resuelta, motivoCierre: 'El menor fue localizado'), 'cierre');
      expect([r['titulo'], r['cuerpo']], ['RESUELTA', 'El menor fue localizado. Gracias por tu ayuda.']);
    });
  });

  group('motor de demostración (mismas reglas que el backend)', () {
    late DateTime ahora;
    late ServicioDemo s;
    late List<AvisoDemo> avisos;

    setUp(() async {
      ahora = DateTime(2026, 11, 14, 17, 42);
      s = ServicioDemo(escenario: EscenarioDemo.panel, reloj: () => ahora, iniciarReloj: false, sembrar: false);
      avisos = [];
      s.avisos.listen(avisos.add);
      await s.iniciarSesionCorreo('validador1@example.com', 'demo');
    });

    tearDown(() => s.cerrar());

    Future<void> tic() async {
      s.avanzar();
      await Future<void>.delayed(Duration.zero);
    }

    List<String> recibieron(String tipo) => avisos.where((a) => a.tipo == tipo).map((a) => a.dispositivo).toList();

    test('P05: anillos A → B → C, D nunca; cierre a quienes la recibieron', () async {
      final r = await s.simularReporteCiudadano(categoria: 'menor_desaparecido', titulo: 'Niño de 8 años');
      expect(r.estado, EstadoAlerta.pendiente);
      await tic();
      expect(recibieron('nueva'), isEmpty, reason: 'en revisión no se difunde');
      expect(recibieron('validacion'), ['validador']);

      await s.validar(r.alertaId!, AccionValidador.verificar);
      await tic();
      expect(recibieron('nueva'), ['A']);

      ahora = ahora.add(const Duration(seconds: 31)); // 15.5 min de demo
      await tic();
      expect(recibieron('nueva'), ['A', 'B']);

      ahora = ahora.add(const Duration(seconds: 90)); // 60.5 min de demo
      await tic();
      expect(recibieron('nueva'), ['A', 'B', 'C']);

      ahora = ahora.add(const Duration(minutes: 10)); // > 180 min: 25 km
      await tic();
      expect(recibieron('nueva'), ['A', 'B', 'C'], reason: 'D (76 km) nunca la recibe');

      await s.validar(r.alertaId!, AccionValidador.resolver, motivo: 'El menor fue localizado');
      await tic();
      expect(recibieron('cierre')..sort(), ['A', 'B', 'C']);
      final cierre = avisos.lastWhere((a) => a.tipo == 'cierre');
      expect(cierre.datos['cuerpo'], 'El menor fue localizado. Gracias por tu ayuda.');
    });

    test('datos semilla del panel: el menor en revisión no se entrega a nadie hasta verificarse', () async {
      final panel = ServicioDemo(escenario: EscenarioDemo.panel, reloj: () => ahora, iniciarReloj: false);
      final recibidos = <AvisoDemo>[];
      panel.avisos.listen(recibidos.add);
      await panel.iniciarSesionCorreo('validador1@example.com', 'demo');
      final lista = await panel.flujoPanel().first;
      final menor = lista.firstWhere((a) => a.estado == EstadoAlerta.pendiente);
      expect(menor.nEntregas, 0);
      await panel.validar(menor.id, AccionValidador.verificar);
      await Future<void>.delayed(Duration.zero);
      expect(recibidos.where((a) => a.tipo == 'nueva').map((a) => a.dispositivo), ['A']);
      panel.cerrar();
    });

    test('colmena: sin validador en 5 min, el reporte en revisión se publica solo a 1 km', () async {
      final r = await s.simularReporteCiudadano(categoria: 'menor_desaparecido', titulo: 'Niño de 8 años');
      expect(r.estado, EstadoAlerta.pendiente);
      ahora = ahora.add(const Duration(minutes: 4));
      await tic();
      expect(recibieron('nueva'), isEmpty);

      ahora = ahora.add(const Duration(minutes: 1));
      await tic();
      final a = await s.obtenerAlerta(r.alertaId!);
      expect(a!.estado, EstadoAlerta.noConfirmada);
      expect(recibieron('nueva'), ['A']);
      expect((await s.bitacora(r.alertaId!)).map((b) => b.accion), ['reportar', 'publicar_auto']);

      ahora = ahora.add(const Duration(minutes: 30)); // 15 h de demo: sin confirmar no pasa de 1 km
      await tic();
      expect(recibieron('nueva'), ['A']);
    });

    test('colmena: un segundo testigo publica al instante el reporte en revisión', () async {
      final r = await s.simularReporteCiudadano(categoria: 'persona_desaparecida', titulo: 'Joven de 17 años');
      expect(r.estado, EstadoAlerta.pendiente);
      final dup = await s.simularReporteCiudadano(categoria: 'persona_desaparecida', titulo: 'Joven de sudadera gris');
      expect(dup.duplicadaDe, r.alertaId);
      expect(dup.estado, EstadoAlerta.noConfirmada);
      await tic();
      expect(recibieron('nueva'), ['A']);
      expect(
        (await s.bitacora(r.alertaId!)).last.descripcion,
        'Publicada por la colmena: otra persona reportó lo mismo',
      );
    });

    test('P08/P09: duplicado suma confirmación y 3 votos la corroboran', () async {
      final r = await s.simularReporteCiudadano(categoria: 'incendio', titulo: 'Humo en bodega');
      expect(r.estado, EstadoAlerta.noConfirmada);
      final dup = await s.simularReporteCiudadano(categoria: 'incendio', titulo: 'Fuego en la bodega');
      expect(dup.duplicadaDe, r.alertaId);
      s.simularVotos(r.alertaId!, TipoConfirmacion.confirmo, cuantos: 2);
      await tic();
      final a = await s.obtenerAlerta(r.alertaId!);
      expect(a!.estado, EstadoAlerta.corroborada);
      expect(recibieron('actualizacion'), ['A']);
      expect(avisos.lastWhere((x) => x.tipo == 'actualizacion').datos['titulo'], 'AHORA CORROBORADA');
    });

    test('reglas: anónimo no reporta, solo instituciones emiten evacuación, título válido', () async {
      final app = ServicioDemo(reloj: () => ahora, iniciarReloj: false, sembrar: false);
      await app.iniciarSesionAnonima();
      expect(
        () => app.crearReporte(
          const NuevoReporte(categoria: 'asalto', titulo: 'Asalto en la esquina', lat: 17.95, lon: -102.19),
        ),
        throwsA(isA<ErrorServicio>()),
      );
      await app.enviarCodigo('5511111111');
      await app.verificarCodigo('5511111111', '123456');
      expect(
        () => app.crearReporte(
          const NuevoReporte(categoria: 'evacuacion', titulo: 'Evacuen la zona', lat: 17.95, lon: -102.19),
        ),
        throwsA(isA<ErrorServicio>()),
      );
      expect(
        () => app.crearReporte(const NuevoReporte(categoria: 'otro', titulo: 'Hey', lat: 17.95, lon: -102.19)),
        throwsA(isA<ErrorServicio>()),
      );
      final ok = await app.crearReporte(
        const NuevoReporte(categoria: 'asalto', titulo: 'Asalto en la esquina', lat: 17.95, lon: -102.19),
      );
      expect(ok.estado, EstadoAlerta.noConfirmada);
      app.cerrar();
    });

    test('WhatsApp simulado: el código "llega" solo al número que lo pidió', () async {
      final app = ServicioDemo(reloj: () => ahora, iniciarReloj: false, sembrar: false);
      await app.iniciarSesionAnonima();
      expect(await app.whatsappSimulado('5522222222'), isNull);
      await app.enviarCodigo('5522222222');
      final m = await app.whatsappSimulado('5522222222');
      expect(m!.codigo, '123456');
      expect(m.texto, contains('tu código de verificación es 123456'));
      expect(await app.whatsappSimulado('5533333333'), isNull);
      await app.verificarCodigo('5522222222', m.codigo!);
      expect(app.perfil.value!.esAnonimo, isFalse);
      app.cerrar();
    });

    test('P11: límite de reportes por hora (10)', () async {
      final app = ServicioDemo(reloj: () => ahora, iniciarReloj: false, sembrar: false);
      await app.iniciarSesionAnonima();
      await app.verificarCodigo('5511111111', '123456');
      for (var i = 0; i < reglasColmena.reportesPorHora; i++) {
        await app.crearReporte(
          NuevoReporte(categoria: 'otro', titulo: 'Reporte $i de prueba', lat: 17.9 + i, lon: -102.19),
        );
      }
      expect(
        () =>
            app.crearReporte(const NuevoReporte(categoria: 'otro', titulo: 'Un reporte más', lat: 29.9, lon: -102.19)),
        throwsA(isA<ErrorServicio>()),
      );
      app.cerrar();
    });

    test('escenario app: el validador simulado verifica en 8 s y mi teléfono recibe la alerta', () async {
      final app = ServicioDemo(reloj: () => ahora, iniciarReloj: false, sembrar: false);
      final mios = <AvisoDemo>[];
      app.avisos.where((a) => a.dispositivo == 'yo').listen(mios.add);
      await app.iniciarSesionAnonima();
      await app.registrarDispositivo(token: 't', plataforma: 'web', celda: '9epq4t');
      await app.verificarCodigo('5511111111', '123456');
      final r = await app.crearReporte(
        NuevoReporte(
          categoria: 'menor_desaparecido',
          titulo: 'Niña de 6 años',
          lat: sucesoDemo.lat,
          lon: sucesoDemo.lon,
        ),
      );
      expect(r.estado, EstadoAlerta.pendiente);
      ahora = ahora.add(const Duration(seconds: 9));
      app.avanzar();
      await Future<void>.delayed(Duration.zero);
      expect(mios.map((a) => a.tipo), ['nueva']);
      expect(mios.single.datos['estado'], 'verificada');
      app.cerrar();
    });
  });
}
