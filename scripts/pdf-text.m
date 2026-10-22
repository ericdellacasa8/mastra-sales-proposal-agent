// Optional macOS verification helper. Uses the system PDFKit, not an app dependency.
#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc != 2) return 2;
    PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:@(argv[1])]];
    if (!document) return 3;
    NSMutableArray *pages = [NSMutableArray array];
    for (NSUInteger i = 0; i < document.pageCount; i++) [pages addObject:[document pageAtIndex:i].string ?: @""];
    NSData *json = [NSJSONSerialization dataWithJSONObject:pages options:0 error:nil];
    fwrite(json.bytes, 1, json.length, stdout);
  }
}
