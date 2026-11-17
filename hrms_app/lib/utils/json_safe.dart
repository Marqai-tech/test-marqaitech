/// Task 116 — shape-agnostic JSON collection helpers.
///
/// Kill-switch for the whole `type 'List<dynamic>' is not a subtype of
/// type 'List<...>'` crash class reported on the Projects module (v1.4.1):
/// every collection read from a decoded JSON payload goes through these
/// helpers instead of `as List` / `as Map` casts, so ANY server shape
/// (null, Map where a List was expected, scalar, list of scalars) degrades
/// to an empty collection instead of a red screen.
library;

/// The value as a raw list, or an empty list for any other shape.
List<dynamic> jsonList(dynamic v) => v is List ? v : const [];

/// The value as a list of JSON objects, or an empty list for any other
/// shape (non-object elements are dropped instead of thrown). Accepts both
/// `Map<String, dynamic>` and `Map<dynamic, dynamic>` elements — literal
/// `{}` values in dynamic context are the latter, and some serializers
/// emit them too.
List<Map<String, dynamic>> jsonMapList(dynamic v) => v is List
    ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
    : const [];

/// The value as a JSON object map, or an empty map for any other shape.
/// Accepts `Map<dynamic, dynamic>` as well (keys are String in every JSON
/// payload this app consumes).
Map<String, dynamic> jsonMap(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : const {};
