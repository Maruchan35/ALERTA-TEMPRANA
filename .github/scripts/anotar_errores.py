"""Convierte la salida de `flutter test` en anotaciones de GitHub Actions.

Así los errores de las pruebas se ven en la pestaña del commit o del pull request sin tener
que abrir los registros completos. Uso:  python3 anotar_errores.py salida.txt [titulo]
"""
import re
import sys

MAX_ANOTACIONES = 8
MAX_CARACTERES = 6000


def escapar(texto: str) -> str:
    return texto.replace('%', '%25').replace('\r', '').replace('\n', '%0A')


def main() -> None:
    ruta = sys.argv[1]
    titulo = sys.argv[2] if len(sys.argv) > 2 else 'Pruebas de Flutter'
    with open(ruta, encoding='utf-8', errors='replace') as f:
        lineas = f.read().splitlines()

    # Bloques que empiezan en una prueba fallida ("[E]") o en una excepción capturada
    inicios = [i for i, l in enumerate(lineas)
               if '[E]' in l or 'EXCEPTION CAUGHT BY' in l or re.search(r'\bTest failed\b', l)]
    bloques = []
    for i in inicios:
        bloque = '\n'.join(lineas[max(0, i - 2):i + 60])
        if bloque not in bloques:
            bloques.append(bloque)
    if not bloques:
        bloques = ['\n'.join(lineas[-80:])]

    for bloque in bloques[:MAX_ANOTACIONES]:
        print(f'::error title={titulo}::{escapar(bloque[:MAX_CARACTERES])}')


if __name__ == '__main__':
    main()
