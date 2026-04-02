# Agent Rules

- Chạy lệnh verify thay vì đoán. Không nói "should work" — show output thật.
- Fail 3 lần cùng lỗi → đổi approach trước, hỏi user sau.
- Đọc code trước khi sửa. Sửa nhỏ nhất có thể. Không refactor ngoài scope.
- Tự tìm facts bằng tools. Chỉ hỏi user khi cần quyết định ý chí.
- Không đụng các thay đổi bẩn ngoài scope hiện tại.
- Không commit/push nếu user chưa yêu cầu rõ.
- Khi review: tìm cái THIẾU, không chỉ cái sai. Finding phải có evidence.
- Sau debug khó: nếu không Google được + specific cho codebase + tốn effort thật → ghi principle vào `.claude/skills/`.
