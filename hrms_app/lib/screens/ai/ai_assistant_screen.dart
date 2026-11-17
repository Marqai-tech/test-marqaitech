import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../../config/api_config.dart';
import '../../config/maan_theme.dart';
import '../../services/api_service.dart';

/// Task 156 — NATIVE AI Assistant screen for the native Android build.
///
/// The WebView-shell app inherits the PhonePe-style violet AI dock from the
/// live web footer; the native build now gets the SAME experience natively:
/// the raised violet centre dock button (see MainBottomNav) opens this chat
/// screen, which talks to the exact same backend endpoint the web bot uses —
/// POST /api/ai-chat with the session Bearer token — so conversations land in
/// the same AIChatLog history and the answers match the web bot.
class AiAssistantScreen extends StatefulWidget {
  const AiAssistantScreen({super.key});

  @override
  State<AiAssistantScreen> createState() => _AiAssistantScreenState();
}

class _AiMessage {
  final String text;
  final bool isUser;
  final bool isError;
  _AiMessage({required this.text, required this.isUser, this.isError = false});
}

class _AiAssistantScreenState extends State<AiAssistantScreen> {
  static const _quickChips = [
    'My leave balance',
    'How to mark attendance?',
    'Payslip & salary help',
    'HR policies',
  ];

  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final List<_AiMessage> _messages = [];
  late final String _sessionId;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // One session id per screen open — mirrors the web bot's per-session
    // history bucket in AIChatLog (source: 'chatbot').
    _sessionId = 'native-${DateTime.now().millisecondsSinceEpoch}';
    _messages.add(_AiMessage(
      text: 'Hi! I am the 3Boxes AI assistant. Ask me about leave, '
          'attendance, payroll, policies or recruitment — I am here to help.',
      isUser: false,
    ));
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty || _sending) return;
    _input.clear();
    setState(() {
      _messages.add(_AiMessage(text: text, isUser: true));
      _sending = true;
    });
    _scrollDown();

    try {
      final token = ApiService.token;
      if (token == null || token.isEmpty) {
        throw Exception('Not signed in');
      }
      final res = await http
          .post(
            Uri.parse('${ApiConfig.baseUrl}/api/ai-chat'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: jsonEncode({'message': text, 'sessionId': _sessionId}),
          )
          .timeout(const Duration(seconds: 45));

      if (res.statusCode == 401) {
        throw Exception('Your session has expired. Please sign in again.');
      }
      if (res.statusCode != 200) {
        throw Exception('Server error (${res.statusCode})');
      }
      final data = jsonDecode(res.body);
      final reply = (data is Map<String, dynamic> ? data['reply'] : null) as String? ??
          'Sorry, I could not process that. Please try again.';
      if (!mounted) return;
      setState(() => _messages.add(_AiMessage(text: reply, isUser: false)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _messages.add(_AiMessage(
            text: 'I could not reach the AI service just now. Please check '
                'your connection (or sign in again) and try once more.',
            isUser: false,
            isError: true,
          )));
    } finally {
      if (mounted) {
        setState(() => _sending = false);
        _scrollDown();
      }
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaanColors.pageBg,
      appBar: _buildAppBar(),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
              itemCount: _messages.length + (_sending ? 1 : 0),
              itemBuilder: (context, i) {
                if (i == _messages.length) return _typingBubble();
                return _bubble(_messages[i]);
              },
            ),
          ),
          if (_messages.length <= 1) _quickChipsBar(),
          _inputBar(),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return AppBar(
      elevation: 0,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      flexibleSpace: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF8B5CF6), Color(0xFFA855F7), Color(0xFFD946EF)],
          ),
        ),
      ),
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
        onPressed: () => Navigator.of(context).maybePop(),
      ),
      titleSpacing: 0,
      title: Row(
        children: [
          Stack(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(.18),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withOpacity(.7), width: 2),
                ),
                child: const Icon(Icons.smart_toy_rounded, color: Colors.white, size: 22),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AI Assistant',
                    style: TextStyle(
                        color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w800)),
                SizedBox(height: 1),
                Text('Online · HR · Payroll · Leave',
                    style: TextStyle(color: Colors.white70, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bubble(_AiMessage m) {
    final isError = m.isError;
    if (m.isUser) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(top: 8, left: 60),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFC026D3)]),
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(16),
              topRight: Radius.circular(16),
              bottomLeft: Radius.circular(16),
              bottomRight: Radius.circular(4),
            ),
          ),
          child: SelectableText(m.text,
              style: const TextStyle(color: Colors.white, fontSize: 13.5, height: 1.35)),
        ),
      );
    }
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 8, right: 60),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isError ? const Color(0xFFFFF1F2) : Colors.white,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(4),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(16),
            bottomRight: Radius.circular(16),
          ),
          border: Border.all(
              color: isError ? const Color(0xFFFECDD3) : Colors.black.withOpacity(.05)),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withOpacity(.04),
                blurRadius: 8,
                offset: const Offset(0, 2)),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isError)
              Padding(
                padding: const EdgeInsets.only(right: 8, top: 1),
                child: Icon(Icons.smart_toy_rounded,
                    size: 15, color: const Color(0xFF8B5CF6).withOpacity(.8)),
              ),
            Flexible(
              child: SelectableText(
                m.text,
                style: TextStyle(
                    fontSize: 13.5,
                    height: 1.4,
                    color: isError ? const Color(0xFF9F1239) : const Color(0xFF1E293B)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _typingBubble() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 8, right: 60),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(4),
            topRight: Radius.circular(16),
            bottomLeft: Radius.circular(16),
            bottomRight: Radius.circular(16),
          ),
          border: Border.all(color: Colors.black.withOpacity(.05)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _dot(0.0),
            const SizedBox(width: 4),
            _dot(0.25),
            const SizedBox(width: 4),
            _dot(0.5),
          ],
        ),
      ),
    );
  }

  Widget _dot(double phase) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 900),
      builder: (context, v, _) {
        final pulse = (v + phase) % 1;
        final up = pulse < .5 ? pulse * 2 : (1 - pulse) * 2;
        return Transform.translate(
          offset: Offset(0, -4 * up),
          child: Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: const Color(0xFF8B5CF6).withOpacity(.35 + .45 * up),
              shape: BoxShape.circle,
            ),
          ),
        );
      },
    );
  }

  Widget _quickChipsBar() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 6),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: _quickChips.map((c) {
          return InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: _sending ? null : () => _send(c),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF8B5CF6).withOpacity(.35)),
                boxShadow: [
                  BoxShadow(
                      color: const Color(0xFF8B5CF6).withOpacity(.08),
                      blurRadius: 8,
                      offset: const Offset(0, 2)),
                ],
              ),
              child: Text(c,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF7C3AED))),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _inputBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(.06),
              blurRadius: 14,
              offset: const Offset(0, -3)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                style: const TextStyle(fontSize: 13.5, color: Color(0xFF1E293B)),
                decoration: InputDecoration(
                  hintText: 'Ask about leave, payroll, attendance…',
                  hintStyle: const TextStyle(fontSize: 12.5, color: MaanColors.faint),
                  filled: true,
                  fillColor: MaanColors.pageBg,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: Colors.black.withOpacity(.06)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: Colors.black.withOpacity(.06)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: Color(0xFF8B5CF6), width: 1.4),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _sending ? null : () => _send(),
              child: Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFD946EF)]),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(color: Color(0x668B5CF6), blurRadius: 10, offset: Offset(0, 3)),
                  ],
                ),
                child: _sending
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
