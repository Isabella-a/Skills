"""Calculate CRAP scores from a coverage.py JSON report.

Run pytest and write its JSON report first, then invoke this module with that
exact report.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import sys
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any

from radon.complexity import cc_visit
from radon.visitors import Function

DEFAULT_EXCLUDE_PATTERNS = ("**/tests/**", "**/evals/**")
DEFAULT_COVERAGE_JSON = "coverage.json"
DEFAULT_HIGH_RISK_THRESHOLD = 30.0


class CoverageInputError(ValueError):
    """Raised when a coverage report cannot be safely used."""


def calculate_crap(complexity: float, coverage_pct: float) -> float:
    """Apply the official CRAP score formula."""
    return (complexity**2) * ((1 - coverage_pct / 100.0) ** 3) + complexity


def _normalise_path(path: str | Path) -> str:
    return str(path).replace("\\", "/").lstrip("./")


def _is_excluded(filepath: str, patterns: tuple[str, ...]) -> bool:
    """Return whether a report path belongs to a test/eval tree or pattern."""
    normalised = _normalise_path(filepath)
    parts = PurePosixPath(normalised).parts
    if any(part in {"tests", "evals"} for part in parts):
        return True
    return any(
        fnmatch.fnmatch(normalised, pattern)
        or PurePosixPath(normalised).match(pattern)
        for pattern in patterns
    )


def _load_coverage_report(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise CoverageInputError(
            f"Arquivo de cobertura não encontrado: {path}. "
            "Execute pytest com --cov-report=json:<arquivo> primeiro."
        )
    try:
        with path.open(encoding="utf-8") as report_file:
            data = json.load(report_file)
    except json.JSONDecodeError as exc:
        raise CoverageInputError(
            f"JSON de cobertura inválido em {path}: linha {exc.lineno}, coluna {exc.colno}."
        ) from exc
    except OSError as exc:
        raise CoverageInputError(f"Não foi possível ler o JSON de cobertura {path}: {exc}") from exc

    if not isinstance(data, dict) or not isinstance(data.get("files"), dict):
        raise CoverageInputError(
            f"JSON de cobertura inválido em {path}: esperado um objeto com a chave 'files'."
        )
    if "meta" in data and not isinstance(data["meta"], dict):
        raise CoverageInputError(f"JSON de cobertura inválido em {path}: 'meta' deve ser um objeto.")
    for filepath, info in data["files"].items():
        if not isinstance(filepath, str) or not isinstance(info, dict):
            raise CoverageInputError(
                f"JSON de cobertura inválido em {path}: entrada de arquivo malformada."
            )
        for line_key in ("executed_lines", "missing_lines", "excluded_lines"):
            lines = info.get(line_key, [])
            if not isinstance(lines, list) or not all(isinstance(line, int) for line in lines):
                raise CoverageInputError(
                    f"JSON de cobertura inválido em {path}: '{line_key}' de {filepath} "
                    "deve ser uma lista de números."
                )
        functions = info.get("functions", {})
        if not isinstance(functions, dict):
            raise CoverageInputError(
                f"JSON de cobertura inválido em {path}: 'functions' de {filepath} deve ser um objeto."
            )
        if not all(isinstance(function_info, dict) for function_info in functions.values()):
            raise CoverageInputError(
                f"JSON de cobertura inválido em {path}: entradas de 'functions' de {filepath} "
                "devem ser objetos."
            )
    return data


def _report_timestamp(data: dict[str, Any]) -> datetime | None:
    value = data.get("meta", {}).get("timestamp")
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _resolve_source_path(source_root: Path, filepath: str) -> Path:
    report_path = Path(filepath)
    return report_path if report_path.is_absolute() else source_root / report_path


def _check_report_freshness(
    report_path: Path,
    report: dict[str, Any],
    source_root: Path,
    filepaths: list[str],
) -> None:
    """Reject a report generated before an analysed source file was changed."""
    timestamp = _report_timestamp(report)
    if timestamp is None:
        return
    report_epoch = timestamp.timestamp()
    changed_after_report = []
    for filepath in filepaths:
        source_path = _resolve_source_path(source_root, filepath)
        if source_path.is_file() and source_path.stat().st_mtime > report_epoch + 2:
            changed_after_report.append(filepath)
    if changed_after_report:
        preview = ", ".join(changed_after_report[:3])
        suffix = "..." if len(changed_after_report) > 3 else ""
        raise CoverageInputError(
            f"Relatório de cobertura desatualizado ({report_path}): "
            f"fonte alterada depois da execução ({preview}{suffix}). "
            "Rode pytest novamente e gere um novo JSON."
        )


def _function_coverage(block: Function, cov_info: dict[str, Any]) -> tuple[float, str]:
    """Get exact function coverage, falling back to line-range coverage.

    coverage.py 7 emits a ``files[*].functions`` map with statement summaries.
    Older reports do not, so the fallback uses executed/missing lines intersected
    with radon's function range.  The latter is less precise for nested blocks.
    """
    functions = cov_info.get("functions")
    if isinstance(functions, dict):
        qualified_name = getattr(block, "fullname", block.name)
        candidates = [qualified_name, block.name]
        matches = []
        for candidate in candidates:
            function_info = functions.get(candidate)
            if isinstance(function_info, dict):
                matches.append(function_info)
        if matches:
            function_info = min(
                matches,
                key=lambda item: abs(int(item.get("start_line", block.lineno)) - block.lineno),
            )
            summary = function_info.get("summary")
            if isinstance(summary, dict):
                percent = summary.get("percent_covered")
                if isinstance(percent, (int, float)):
                    return float(percent), "coverage.py function summary"

    executed_lines = set(cov_info.get("executed_lines", []))
    missing_lines = set(cov_info.get("missing_lines", []))
    executed = sum(1 for line in executed_lines if block.lineno <= line <= block.endline)
    missing = sum(1 for line in missing_lines if block.lineno <= line <= block.endline)
    total = executed + missing
    return (0.0 if total == 0 else executed / total * 100.0), "line-range fallback"


def get_crap_for_codebase(
    source_dir: str | Path = ".",
    coverage_json_path: str | Path = DEFAULT_COVERAGE_JSON,
    *,
    exclude_patterns: tuple[str, ...] = DEFAULT_EXCLUDE_PATTERNS,
    only_paths: tuple[str, ...] = (),
    threshold: float = DEFAULT_HIGH_RISK_THRESHOLD,
) -> dict[str, Any]:
    """Print and return a CRAP report for production source files.

    ``only_paths`` restringe a análise a arquivos específicos do relatório — é o
    que permite pontuar apenas o diff de uma spec em vez da codebase inteira.
    """
    source_root = Path(source_dir).resolve()
    report_path = Path(coverage_json_path).resolve()
    coverage_data = _load_coverage_report(report_path)
    files_cov = coverage_data["files"]
    wanted = {_normalise_path(p) for p in only_paths}
    included_paths = [
        filepath
        for filepath in files_cov
        if not _is_excluded(filepath, exclude_patterns)
        and (not wanted or _normalise_path(filepath) in wanted)
    ]
    _check_report_freshness(report_path, coverage_data, source_root, included_paths)

    total_crap = 0.0
    high_risk_functions = []
    analyzed_functions = []
    total_functions = 0
    fallback_count = 0
    skipped_files = []

    for filepath in included_paths:
        cov_info = files_cov[filepath]
        full_path = _resolve_source_path(source_root, filepath)
        if not full_path.is_file():
            skipped_files.append(f"{filepath} (arquivo não encontrado)")
            continue
        try:
            code = full_path.read_text(encoding="utf-8")
            blocks = cc_visit(code)
        except (OSError, SyntaxError, UnicodeError) as exc:
            skipped_files.append(f"{filepath} ({type(exc).__name__})")
            continue

        for block in blocks:
            if not isinstance(block, Function):
                continue
            coverage_pct, coverage_source = _function_coverage(block, cov_info)
            if coverage_source == "line-range fallback":
                fallback_count += 1
            crap_score = calculate_crap(block.complexity, coverage_pct)
            total_crap += crap_score
            total_functions += 1
            analyzed_functions.append(
                {
                    "file": filepath,
                    "name": getattr(block, "fullname", block.name),
                    "crap": crap_score,
                    "comp": block.complexity,
                    "cov": coverage_pct,
                    "coverage_source": coverage_source,
                }
            )
            if crap_score > threshold:
                high_risk_functions.append(analyzed_functions[-1])

    if total_functions == 0:
        if not wanted:
            raise CoverageInputError(
                "Nenhuma função de produção foi analisada no relatório informado."
            )
        # Com filtro explícito, "nenhuma função" é um resultado legítimo (arquivo só com
        # constantes, ou alterado fora do relatório) — quem chama decide o que fazer.
        print("--- Relatório CRAP ---")
        print(f"Fonte de cobertura: {report_path}")
        print("Nenhuma função encontrada nos arquivos filtrados — sem sinal de CRAP.")
        return {
            "total_functions": 0,
            "average_crap": 0.0,
            "functions": [],
            "high_risk_functions": [],
            "fallback_functions": fallback_count,
            "skipped_files": skipped_files,
            "coverage_json": str(report_path),
            "threshold": threshold,
            "only_paths": sorted(wanted),
        }

    high_risk_functions.sort(key=lambda item: item["crap"], reverse=True)
    avg_crap = total_crap / total_functions
    result = {
        "total_functions": total_functions,
        "average_crap": avg_crap,
        "functions": analyzed_functions,
        "high_risk_functions": high_risk_functions,
        "fallback_functions": fallback_count,
        "skipped_files": skipped_files,
        "coverage_json": str(report_path),
        "threshold": threshold,
        "only_paths": sorted(wanted),
    }

    print("--- Relatório CRAP ---")
    print(f"Fonte de cobertura: {report_path}")
    print(f"Total de funções analisadas: {total_functions}")
    print(f"CRAP Médio da Codebase: {avg_crap:.2f}")
    if fallback_count:
        print(
            f"Aviso: {fallback_count} função(ões) usaram fallback por linhas; "
            "gere o JSON com uma versão atual do coverage.py para maior precisão."
        )
    if skipped_files:
        print(f"Aviso: {len(skipped_files)} arquivo(s) ignorado(s): {', '.join(skipped_files[:3])}")
    if high_risk_functions:
        print(f"\n⚠️ Funções de Alto Risco (CRAP > {threshold:g}):")
        for function in high_risk_functions:
            print(f"- {function['file']} -> {function['name']}()")
            print(
                f"  CRAP: {function['crap']:.2f} | Complexidade: {function['comp']} | "
                f"Cobertura: {function['cov']:.1f}%"
            )
    return result


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "coverage_json",
        nargs="?",
        help=f"caminho do JSON do coverage.py (padrão: {DEFAULT_COVERAGE_JSON})",
    )
    parser.add_argument(
        "--coverage-json",
        dest="coverage_json_option",
        help="caminho explícito do JSON do coverage.py",
    )
    parser.add_argument("--source-dir", default=".", help="raiz dos caminhos no relatório (padrão: .)")
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="ARQUIVO",
        help="restringe a análise a este arquivo do relatório (repetível)",
    )
    parser.add_argument(
        "--only-from",
        metavar="LISTA",
        help="arquivo com um caminho por linha para restringir a análise",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_HIGH_RISK_THRESHOLD,
        help=f"CRAP acima do qual a função é de alto risco (padrão: {DEFAULT_HIGH_RISK_THRESHOLD:g})",
    )
    parser.add_argument("--json-out", metavar="ARQUIVO", help="grava o relatório como JSON")
    return parser.parse_args(argv)


def _read_only_list(path: Path) -> list[str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise CoverageInputError(f"Não foi possível ler a lista de arquivos {path}: {exc}") from exc
    return [line.strip() for line in lines if line.strip()]


def _write_json_report(path: Path, result: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError as exc:
        raise CoverageInputError(f"Não foi possível gravar o relatório JSON {path}: {exc}") from exc


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.coverage_json and args.coverage_json_option:
        print("Erro: informe o caminho do coverage JSON uma única vez.", file=sys.stderr)
        return 2
    coverage_path = args.coverage_json_option or args.coverage_json or DEFAULT_COVERAGE_JSON
    try:
        only_paths = list(args.only)
        if args.only_from:
            only_paths.extend(_read_only_list(Path(args.only_from)))
        result = get_crap_for_codebase(
            args.source_dir,
            coverage_path,
            only_paths=tuple(only_paths),
            threshold=args.threshold,
        )
        if args.json_out:
            _write_json_report(Path(args.json_out), result)
    except CoverageInputError as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
