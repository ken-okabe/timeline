// Timeline の型定義。内部では Option 型で値を保持する
type Timeline<'a> =
    { mutable state: 'a option }

    // 現在の値を取得するためのプロパティ
    member this.Value = this.state

// Timeline を操作するためのモジュール
module Timeline =

    /// <summary>
    /// 値または null から Timeline インスタンスを生成します。
    /// 型推論が難しい場合があるため、型注釈 (例: let t: Timeline<int> = ...) が推奨されます。
    /// </summary>
    /// <param name="initialValue">初期値 (例: 10) または null。</param>
    let create<'a> (initialValue: obj) : Timeline<'a> =
        let internalState =
            // 1. まず null ケースを処理する
            if isNull initialValue then
                None
            else
                // 2. 渡された obj を目的の型 'a' に安全に変換 (アンボックス) する
                match tryUnbox<'a> initialValue with
                | Some value -> Some value
                | None ->
                    // 3. 型が一致しない場合は、分かりやすいエラーを投げる
                    let expectedType = typeof<'a>.Name
                    let actualType = initialValue.GetType().Name
                    let msg = $"Timeline<{expectedType}> を作成しようとしましたが、型が異なる値 ('{actualType}') が渡されました。"
                    invalidArg "initialValue" msg

        { state = internalState }

    /// <summary>
    /// Timeline の値を更新します。
    /// </summary>
    /// <param name="timeline">更新対象の Timeline インスタンス。</param>
    /// <param name="value">新しい値 (例: 20) または null。</param>
    let set (timeline: Timeline<'a>) (value: obj) =
        let internalState =
            if isNull value then
                None
            else
                match tryUnbox<'a> value with
                | Some v -> Some v
                | None ->
                    let expectedType = typeof<'a>.Name
                    let actualType = value.GetType().Name
                    let msg = $"Timeline<{expectedType}> に値を設定しようとしましたが、型が異なる値 ('{actualType}') が渡されました。"
                    invalidArg "value" msg

        timeline.state <- internalState


// --- 生成 (create) ---

// int 型の Timeline を値 '10' で生成
let timelineInt: Timeline<int> = Timeline.create 10
printfn "Intの初期値: %A" timelineInt.Value  // 出力: Intの初期値: Some 10

// string 型の Timeline を null で生成
let timelineString: Timeline<string> = Timeline.create null
printfn "Stringの初期値 (null): %A" timelineString.Value // 出力: Stringの初期値 (null): None


// --- 更新 (set) ---

printfn "\n--- 値の更新 ---"
printfn "更新前の値: %A" timelineInt.Value // 更新前の値: Some 10

// 値を 200 に更新
Timeline.set timelineInt 200
printfn "200に更新後: %A" timelineInt.Value // 200に更新後: Some 200

// 値を null に更新
Timeline.set timelineInt null
printfn "nullに更新後: %A" timelineInt.Value // nullに更新後: None


// --- 型が違う場合の安全なエラー ---
try
    // Timeline<int> に string を設定しようとすると...
    Timeline.set timelineInt "hello"
with
| ex -> printfn "\nエラー発生: %s" ex.Message
// 出力: エラー発生: Timeline<int> に値を設定しようとしましたが、型が異なる値 ('String') が渡されました。